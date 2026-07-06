import re

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from services import email_verify, smtp_mailer

router = APIRouter(prefix="/auth/email", tags=["email-verification"])

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class SendCodeRequest(BaseModel):
    email: str


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


@router.post("/send-code")
async def send_code(body: SendCodeRequest):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="올바른 이메일 형식이 아닙니다.")

    try:
        code = email_verify.issue_code(email)
    except RuntimeError as e:
        raise HTTPException(status_code=429, detail=str(e))

    title = "[VLUR CAPTCHA] 이메일 인증번호"
    mail_body = (
        "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
        "<h2 style='color:#e8590c'>VLUR CAPTCHA 이메일 인증</h2>"
        "<p>아래 인증번호를 회원가입 화면에 입력해 주세요.</p>"
        f"<div style='font-size:32px;font-weight:700;letter-spacing:8px;"
        f"background:#faf6f1;border-radius:12px;padding:20px;text-align:center'>{code}</div>"
        "<p style='color:#888;font-size:13px'>인증번호는 3분간 유효합니다. "
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>"
        "</div>"
    )
    try:
        await run_in_threadpool(smtp_mailer.send_mail, email, title, mail_body)
    except RuntimeError as e:
        email_verify.discard_code(email)
        print(f"[email-verification] 발송 실패: {e}")
        raise HTTPException(status_code=502, detail="인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    return {"message": "인증번호가 발송되었습니다.", "ttl": email_verify.CODE_TTL}


@router.post("/verify-code")
def verify_code(body: VerifyCodeRequest):
    ok, reason = email_verify.verify_code(body.email, body.code)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    return {"message": "이메일 인증이 완료되었습니다."}
