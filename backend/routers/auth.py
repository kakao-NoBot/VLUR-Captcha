from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel
from auth.hash import hash_password, verify_password
from auth.jwt import create_access_token
from auth.deps import get_current_user
from db import get_conn

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


@router.post("/login")
def login(body: LoginRequest):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id, user_name, password_hash, role, user_status "
                "FROM users WHERE user_id = %s",
                (body.user_id,),
            )
            user = cur.fetchone()

    if not user or not verify_password(body.password, user["password_hash"]):
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
            "role": user["role"],
        },
    }


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
            "role": "user",
        },
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
