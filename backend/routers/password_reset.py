"""비밀번호 찾기(재설정) — 이메일 인증코드 방식

회원가입 이메일 인증과 같은 인증코드 저장소(email_verify)를 쓰되,
'pwreset:' 접두사 키로 분리해 두 흐름이 섞이지 않게 한다.
"""
import re

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from auth.hash import hash_password
from db import get_conn
from services import email_verify, smtp_mailer

router = APIRouter(prefix="/auth/password-reset", tags=["password-reset"])

PASSWORD_RE = re.compile(
    r"""^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>/?`~]).{8,16}$"""
)


def _reset_key(email: str) -> str:
    return f"pwreset:{email.strip().lower()}"


def _find_active_user(user_id: str, email: str) -> dict | None:
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT user_id, email, password_hash FROM users
                   WHERE user_id = %s AND email = %s AND user_status = 'active'""",
                (user_id.strip(), email.strip().lower()),
            )
            return cur.fetchone()


class SendCodeRequest(BaseModel):
    user_id: str
    email: str


class VerifyCodeRequest(BaseModel):
    user_id: str
    email: str
    code: str


class ConfirmRequest(BaseModel):
    user_id: str
    email: str
    new_password: str


@router.post("/send-code")
async def send_code(body: SendCodeRequest):
    user = _find_active_user(body.user_id, body.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="일치하는 회원 정보가 없습니다.",
        )
    if not user["password_hash"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="소셜 로그인 계정은 비밀번호 재설정이 필요하지 않습니다.",
        )

    try:
        code = email_verify.issue_code(_reset_key(body.email))
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))

    title = "[VLUR CAPTCHA] 비밀번호 재설정 인증번호"
    mail_body = (
        "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
        "<h2 style='color:#e8590c'>VLUR CAPTCHA 비밀번호 재설정</h2>"
        "<p>아래 인증번호를 비밀번호 찾기 화면에 입력해 주세요.</p>"
        f"<div style='font-size:32px;font-weight:700;letter-spacing:8px;"
        f"background:#faf6f1;border-radius:12px;padding:20px;text-align:center'>{code}</div>"
        "<p style='color:#888;font-size:13px'>인증번호는 3분간 유효합니다. "
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>"
        "</div>"
    )
    try:
        await run_in_threadpool(smtp_mailer.send_mail, body.email.strip().lower(), title, mail_body)
    except RuntimeError as e:
        email_verify.discard_code(_reset_key(body.email))
        print(f"[password-reset] 발송 실패: {e}")
        raise HTTPException(status_code=502, detail="인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    return {"message": "인증번호가 발송되었습니다.", "ttl": email_verify.CODE_TTL}


@router.post("/verify-code")
def verify_code(body: VerifyCodeRequest):
    ok, reason = email_verify.verify_code(_reset_key(body.email), body.code)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    return {"message": "인증이 완료되었습니다."}


@router.post("/confirm")
def confirm(body: ConfirmRequest):
    if not email_verify.is_verified(_reset_key(body.email)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="이메일 인증이 필요합니다. 처음부터 다시 시도해 주세요.",
        )
    if not PASSWORD_RE.match(body.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호는 8~16자, 영문 대소문자·숫자·특수문자를 포함해야 합니다.",
        )
    user = _find_active_user(body.user_id, body.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="일치하는 회원 정보가 없습니다.",
        )

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE user_id = %s",
                (hash_password(body.new_password), user["user_id"]),
            )
        conn.commit()

    email_verify.consume_verified(_reset_key(body.email))
    return {"message": "비밀번호가 변경되었습니다."}
