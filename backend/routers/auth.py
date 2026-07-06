import hashlib

from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from auth.hash import hash_password, verify_password
from auth.jwt import create_access_token
from auth.deps import get_current_user
from db import get_conn
from services import email_verify, smtp_mailer
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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

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
                    cur.execute(
                        """INSERT INTO users
                           (user_id, user_name, password_hash, email, phone, plan_id, subscription_date)
                           VALUES (%s, %s, NULL, %s, NULL, NULL, NULL)""",
                        (user_id, user_name, email),
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
                "SELECT user_id, user_name, password_hash, email, phone, role, user_status, created_at "
                "FROM users WHERE user_id = %s",
                (body.user_id,),
            )
            user = cur.fetchone()

    if (
        not user
        or not user["password_hash"]
        or not verify_password(body.password, user["password_hash"])
        # 탈퇴 계정은 존재 여부를 노출하지 않도록 잘못된 자격증명과 동일하게 응답
        or user["user_status"] == "deleted"
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
            "created_at": user["created_at"],
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
    if not email_verify.is_verified(body.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 인증이 필요합니다.",
        )
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
            if body.phone:
                cur.execute("SELECT 1 FROM users WHERE phone = %s", (body.phone,))
                if cur.fetchone():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="이미 사용 중인 전화번호입니다.",
                    )
            pw_hash = hash_password(body.password)
            cur.execute(
                """INSERT INTO users (user_id, user_name, password_hash, email, phone, plan_id, subscription_date)
                   VALUES (%s, %s, %s, %s, %s, NULL, NULL)""",
                (body.user_id, body.user_name, pw_hash, body.email, body.phone),
            )
            cur.execute("SELECT created_at FROM users WHERE user_id = %s", (body.user_id,))
            created = cur.fetchone()
        conn.commit()

    email_verify.consume_verified(body.email)

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
            "created_at": created["created_at"] if created else None,
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.user_id, u.user_name, u.email, u.phone, u.role,
                          u.created_at, u.subscription_date, pl.plan_name
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s""",
                (current_user["sub"],),
            )
            profile = cur.fetchone()

    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자를 찾을 수 없습니다.")

    return profile


class UpdateProfileRequest(BaseModel):
    user_name: str
    email: str
    phone: str | None = None


@router.put("/me")
def update_me(body: UpdateProfileRequest, current_user: dict = Depends(get_current_user)):
    """내 정보 수정 (이름·이메일·전화번호)"""
    user_id = current_user["sub"]
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM users WHERE email = %s AND user_id <> %s",
                (body.email, user_id),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 이메일입니다.",
                )
            cur.execute(
                "UPDATE users SET user_name = %s, email = %s, phone = %s WHERE user_id = %s",
                (body.user_name, body.email, body.phone, user_id),
            )
            cur.execute(
                "SELECT user_id, user_name, email, phone, role, created_at "
                "FROM users WHERE user_id = %s",
                (user_id,),
            )
            updated = cur.fetchone()
        conn.commit()
    return {"user": updated}


class VerifyPasswordRequest(BaseModel):
    password: str


@router.post("/verify-password")
def verify_password_endpoint(
    body: VerifyPasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE user_id = %s",
                (current_user["sub"],),
            )
            user = cur.fetchone()

    if not user or not user["password_hash"] or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="현재 비밀번호가 일치하지 않습니다.",
        )
    return {"valid": True}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM users WHERE user_id = %s",
                (current_user["sub"],),
            )
            user = cur.fetchone()

            if not user or not user["password_hash"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="소셜 로그인 계정은 비밀번호를 변경할 수 없습니다.",
                )
            if not verify_password(body.current_password, user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="현재 비밀번호가 일치하지 않습니다.",
                )

            new_hash = hash_password(body.new_password)
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE user_id = %s",
                (new_hash, current_user["sub"]),
            )
        conn.commit()

    return {"message": "비밀번호가 변경되었습니다."}


class FindIdRequest(BaseModel):
    email: str


def _mask_user_id(user_id: str) -> str:
    """앞 3자만 남기고 마스킹 (3자 이하면 첫 글자만)"""
    visible = 3 if len(user_id) > 3 else 1
    return user_id[:visible] + "*" * max(len(user_id) - visible, 2)


@router.post("/find-id")
async def find_id(body: FindIdRequest):
    """가입 이메일로 아이디 발송"""
    email = body.email.strip().lower()
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT user_id, password_hash FROM users
                   WHERE email = %s AND user_status = 'active'""",
                (email,),
            )
            user = cur.fetchone()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 이메일로 가입된 계정이 없습니다.",
        )
    if not user["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="소셜 로그인으로 가입된 계정입니다. 소셜 로그인을 이용해 주세요.",
        )

    title = "[VLUR CAPTCHA] 아이디 찾기 안내"
    mail_body = (
        "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
        "<h2 style='color:#e8590c'>VLUR CAPTCHA 아이디 찾기</h2>"
        "<p>요청하신 계정의 아이디는 아래와 같습니다.</p>"
        f"<div style='font-size:24px;font-weight:700;"
        f"background:#faf6f1;border-radius:12px;padding:20px;text-align:center'>{user['user_id']}</div>"
        "<p style='color:#888;font-size:13px'>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>"
        "</div>"
    )
    try:
        await run_in_threadpool(smtp_mailer.send_mail, email, title, mail_body)
    except RuntimeError as e:
        print(f"[find-id] 발송 실패: {e}")
        raise HTTPException(status_code=502, detail="메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    return {"message": "이메일로 아이디를 전송했습니다.", "masked_id": _mask_user_id(user["user_id"])}


class DeactivateRequest(BaseModel):
    password: str = ""


@router.post("/deactivate")
def deactivate(body: DeactivateRequest, current_user: dict = Depends(get_current_user)):
    """계정 탈퇴 — 결제/게시글 이력의 FK 무결성을 위해 user_status='deleted' 소프트 삭제"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash, user_status FROM users WHERE user_id = %s",
                (current_user["sub"],),
            )
            user = cur.fetchone()
            if not user or user["user_status"] != "active":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="탈퇴할 수 있는 계정이 아닙니다.",
                )
            # 일반 계정은 비밀번호 확인, 소셜 계정(해시 없음)은 토큰 인증만으로 진행
            if user["password_hash"] and not verify_password(body.password, user["password_hash"]):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="비밀번호가 일치하지 않습니다.",
                )
            # 이메일을 익명화해 같은 이메일로 재가입할 수 있게 함 (UNIQUE 제약 해제 효과)
            cur.execute(
                """UPDATE users
                   SET user_status = 'deleted',
                       subscription_date = NULL,
                       email = CONCAT('deleted_', user_id, '_', UNIX_TIMESTAMP(), '@deleted.invalid')
                   WHERE user_id = %s""",
                (current_user["sub"],),
            )
            # 소셜 연결 해제 — 같은 소셜 계정으로 재가입 가능하게
            cur.execute(
                "DELETE FROM social_accounts WHERE user_id = %s",
                (current_user["sub"],),
            )
        conn.commit()

    return {"message": "탈퇴가 완료되었습니다."}