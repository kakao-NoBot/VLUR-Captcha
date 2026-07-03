import hashlib

from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel
from auth.hash import hash_password, verify_password
from auth.jwt import create_access_token
from auth.deps import get_current_user
from db import get_conn
from services.kakao_oauth import (
    KakaoConfigurationError,
    KakaoOAuthError,
    build_authorize_url,
    fetch_kakao_user,
)
from services.naver_oauth import (
    NaverConfigurationError,
    NaverOAuthError,
    build_naver_authorize_url,
    fetch_naver_user,
)
from services.google_oauth import (
    GoogleConfigurationError,
    GoogleOAuthError,
    build_google_authorize_url,
    fetch_google_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    user_id: str
    password: str


class SignupRequest(BaseModel):
    user_id: str
    user_name: str
    password: str
    email: str
    phone: str | None = None


class KakaoCallbackRequest(BaseModel):
    code: str


class NaverCallbackRequest(BaseModel):
    code: str
    state: str


class GoogleCallbackRequest(BaseModel):
    code: str


def _find_or_create_social_user(
    provider: str,
    provider_user_id: str,
    email: str,
    user_name: str,
):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.user_id, u.user_name, u.email, u.phone, u.role, u.user_status
                   FROM social_accounts s
                   JOIN users u ON u.user_id = s.user_id
                   WHERE s.provider = %s AND s.provider_user_id = %s""",
                (provider, provider_user_id),
            )
            user = cur.fetchone()

            if not user:
                cur.execute(
                    """SELECT user_id, user_name, email, phone, role, user_status
                       FROM users WHERE email = %s""",
                    (email,),
                )
                user = cur.fetchone()

                if not user:
                    identifier = hashlib.sha256(provider_user_id.encode()).hexdigest()[:40]
                    user_id = f"{provider}_{identifier}"[:50]
                    cur.execute("SELECT plan_id FROM plans WHERE plan_name = 'Free' LIMIT 1")
                    plan = cur.fetchone()
                    cur.execute(
                        """INSERT INTO users
                           (user_id, user_name, password_hash, email, phone, plan_id, subscription_date)
                           VALUES (%s, %s, NULL, %s, NULL, %s, NOW())""",
                        (user_id, user_name, email, plan["plan_id"] if plan else None),
                    )
                    user = {
                        "user_id": user_id,
                        "user_name": user_name,
                        "email": email,
                        "phone": None,
                        "role": "user",
                        "user_status": "active",
                    }

                cur.execute(
                    """INSERT INTO social_accounts (user_id, provider, provider_user_id)
                       VALUES (%s, %s, %s)""",
                    (user["user_id"], provider, provider_user_id),
                )
        conn.commit()

    if user["user_status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다.",
        )
    return user


def _social_login_response(user: dict):
    token = create_access_token({
        "sub": user["user_id"],
        "role": user["role"],
        "name": user["user_name"],
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": user["user_id"],
            "user_name": user["user_name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
        },
    }


@router.post("/login")
def login(body: LoginRequest):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, user_name, password_hash, email, phone, role, user_status "
                "FROM users WHERE user_id = %s",
                (body.user_id,),
            )
            user = cur.fetchone()

    if (
        not user
        or not user["password_hash"]
        or not verify_password(body.password, user["password_hash"])
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="아이디 또는 비밀번호가 올바르지 않습니다.",
        )
    if user["user_status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="비활성화된 계정입니다.",
        )

    token = create_access_token({
        "sub": user["user_id"],
        "role": user["role"],
        "name": user["user_name"],
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": user["user_id"],
            "user_name": user["user_name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
        },
    }


@router.get("/kakao/authorize-url")
def kakao_authorize_url(state: str = Query(min_length=16, max_length=256)):
    try:
        return {"authorize_url": build_authorize_url(state)}
    except KakaoConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/kakao/callback")
async def kakao_callback(body: KakaoCallbackRequest):
    try:
        kakao_user = await fetch_kakao_user(body.code)
    except KakaoConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except KakaoOAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    provider_user_id = kakao_user["provider_user_id"]
    email = (kakao_user.get("email") or "").strip().lower()
    user_name = (kakao_user.get("nickname") or "카카오 사용자").strip()[:100]

    if not provider_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="카카오 사용자 식별 정보를 확인하지 못했습니다.",
        )
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="카카오 이메일 제공에 동의해야 가입할 수 있습니다.",
        )

    user = _find_or_create_social_user(
        "kakao", provider_user_id, email, user_name
    )
    return _social_login_response(user)


@router.get("/naver/authorize-url")
def naver_authorize_url(state: str = Query(min_length=16, max_length=256)):
    try:
        return {"authorize_url": build_naver_authorize_url(state)}
    except NaverConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/naver/callback")
async def naver_callback(body: NaverCallbackRequest):
    try:
        naver_user = await fetch_naver_user(body.code, body.state)
    except NaverConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except NaverOAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    provider_user_id = naver_user["provider_user_id"]
    email = (naver_user.get("email") or "").strip().lower()
    user_name = (naver_user.get("user_name") or "").strip()[:100]

    if not provider_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="네이버 사용자 식별 정보를 확인하지 못했습니다.",
        )
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="네이버 이메일 제공에 동의해야 가입할 수 있습니다.",
        )
    if not user_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="네이버 회원이름 제공에 동의해야 가입할 수 있습니다.",
        )

    user = _find_or_create_social_user(
        "naver", provider_user_id, email, user_name
    )
    return _social_login_response(user)


@router.get("/google/authorize-url")
def google_authorize_url(state: str = Query(min_length=16, max_length=256)):
    try:
        return {"authorize_url": build_google_authorize_url(state)}
    except GoogleConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/google/callback")
async def google_callback(body: GoogleCallbackRequest):
    try:
        google_user = await fetch_google_user(body.code)
    except GoogleConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except GoogleOAuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    provider_user_id = google_user["provider_user_id"]
    email = (google_user.get("email") or "").strip().lower()
    user_name = (google_user.get("user_name") or "").strip()[:100]

    if not provider_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="구글 사용자 식별 정보를 확인하지 못했습니다.",
        )
    if not email or not google_user.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="인증된 구글 이메일이 필요합니다.",
        )
    if not user_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="구글 이름 정보를 확인하지 못했습니다.",
        )

    user = _find_or_create_social_user(
        "google", provider_user_id, email, user_name
    )
    return _social_login_response(user)


@router.get("/check-id")
def check_id(user_id: str):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE user_id = %s", (user_id,))
            taken = cur.fetchone() is not None
    return {"available": not taken}


@router.post("/signup", status_code=201)
def signup(body: SignupRequest):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE user_id = %s", (body.user_id,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 아이디입니다.",
                )
            cur.execute("SELECT 1 FROM users WHERE email = %s", (body.email,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 이메일입니다.",
                )
            cur.execute("SELECT plan_id FROM plans WHERE plan_name = 'Free' LIMIT 1")
            plan = cur.fetchone()
            pw_hash = hash_password(body.password)
            cur.execute(
                """INSERT INTO users (user_id, user_name, password_hash, email, phone, plan_id, subscription_date)
                   VALUES (%s, %s, %s, %s, %s, %s, NOW())""",
                (body.user_id, body.user_name, pw_hash, body.email, body.phone,
                 plan["plan_id"] if plan else None),
            )
        conn.commit()

    token = create_access_token({
        "sub": body.user_id,
        "role": "user",
        "name": body.user_name,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "user_id": body.user_id,
            "user_name": body.user_name,
            "email": body.email,
            "phone": body.phone,
            "role": "user",
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
