# contact.py

import secrets
import string

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Literal
from auth.deps import get_current_admin
from auth.hash import hash_password
from db import get_conn
from services import smtp_mailer

router = APIRouter(tags=["contact"])


class ContactRequest(BaseModel):
    email: str
    message: str
    inquiry_type: str = "general"  # 'general'(footer 문의) | 'enterprise'(도입 문의)
    company: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    service_url: str | None = None
    plan_interest: str | None = None


class InquiryStatusUpdate(BaseModel):
    status: Literal["new", "in_progress", "done", "spam"]


def _generate_business_user_id(cur) -> str:
    """biz_ 접두사 + 랜덤 hex — 중복되지 않을 때까지 재시도"""
    for _ in range(20):
        candidate = f"biz_{secrets.token_hex(6)}"
        cur.execute("SELECT 1 FROM users WHERE user_id = %s", (candidate,))
        if not cur.fetchone():
            return candidate
    raise HTTPException(status_code=500, detail="사용자 ID 생성에 실패했습니다. 다시 시도해주세요.")


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _provision_enterprise_account(inquiry: dict) -> dict | None:
    """기업 문의가 '답변' 처리되면 Enterprise 플랜 계정을 자동 생성한다.
       이미 가입된 이메일이면 아무 것도 하지 않고 None을 반환한다(중복 생성 방지)."""
    email = (inquiry.get("email") or "").strip().lower()
    if not email:
        return None

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                return None

            cur.execute("SELECT plan_id FROM plans WHERE plan_name = 'Enterprise'")
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=500, detail="Enterprise 요금제를 찾을 수 없습니다.")

            user_id = _generate_business_user_id(cur)
            temp_password = _generate_temp_password()
            pw_hash = hash_password(temp_password)

            cur.execute(
                """INSERT INTO users
                       (user_id, user_name, password_hash, email, phone,
                        company_name, contact_name, plan_id, subscription_date)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())""",
                (
                    user_id,
                    inquiry.get("contact_name") or inquiry.get("company") or "담당자",
                    pw_hash,
                    email,
                    inquiry.get("phone"),
                    inquiry.get("company"),
                    inquiry.get("contact_name"),
                    plan["plan_id"],
                ),
            )
        conn.commit()

    return {"user_id": user_id, "temp_password": temp_password, "email": email}


def _send_enterprise_account_email(company: str | None, email: str, user_id: str, temp_password: str):
    title = "[VLUR CAPTCHA] 기업 계정이 발급되었습니다"
    body = (
        "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>"
        "<h2 style='color:#e8590c'>VLUR CAPTCHA 기업 계정 안내</h2>"
        f"<p>{company or ''} 담당자님, 도입 문의해 주셔서 감사합니다.<br>"
        "Enterprise 요금제 계정이 발급되었습니다.</p>"
        "<table style='width:100%;border-collapse:collapse;margin:16px 0'>"
        f"<tr><td style='padding:8px 0;color:#888'>아이디</td>"
        f"<td style='padding:8px 0;font-weight:700'>{user_id}</td></tr>"
        f"<tr><td style='padding:8px 0;color:#888'>임시 비밀번호</td>"
        f"<td style='padding:8px 0;font-weight:700'>{temp_password}</td></tr>"
        "</table>"
        "<p style='color:#888;font-size:13px'>로그인 후 반드시 비밀번호를 변경해 주세요.</p>"
        "</div>"
    )
    smtp_mailer.send_mail(email, title, body)


@router.post("/contact", status_code=201)
def create_inquiry(body: ContactRequest):
    """누구나(비로그인 포함) 문의를 남길 수 있음 → contact_inquiries 저장"""
    inquiry_type = body.inquiry_type if body.inquiry_type in ("general", "enterprise") else "general"
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO contact_inquiries
                       (inquiry_type, company, contact_name, email, phone, service_url, plan_interest, message)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (inquiry_type, body.company, body.contact_name, body.email, body.phone,
                 body.service_url, body.plan_interest, body.message),
            )
        conn.commit()
    return {"message": "문의가 접수되었습니다."}


@router.get("/admin/inquiries")
def list_inquiries(admin: dict = Depends(get_current_admin)):
    """관리자 전용 — 접수된 문의 목록 조회"""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT inquiry_id, inquiry_type, company, contact_name, email, phone,
                          service_url, plan_interest, message, inquiry_status, created_at
                   FROM contact_inquiries
                   ORDER BY created_at DESC"""
            )
            rows = cur.fetchall()
    return {"inquiries": rows}


@router.delete("/admin/inquiries/{inquiry_id}")
def delete_inquiry(inquiry_id: int, admin: dict = Depends(get_current_admin)):
    """관리자 전용 — 문의 영구 삭제."""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT inquiry_id FROM contact_inquiries WHERE inquiry_id = %s", (inquiry_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="해당 문의를 찾을 수 없습니다.")
            cur.execute("DELETE FROM contact_inquiries WHERE inquiry_id = %s", (inquiry_id,))
        conn.commit()
    return {"message": "문의가 삭제되었습니다.", "inquiry_id": inquiry_id}


@router.patch("/admin/inquiries/{inquiry_id}/status")
async def update_inquiry_status(
    inquiry_id: int,
    body: InquiryStatusUpdate,
    admin: dict = Depends(get_current_admin),
):
    """관리자 전용 — 문의 상태 변경 (접수/검토/답변/스팸).
       기업 문의를 '답변'으로 바꾸면 Enterprise 계정을 자동 발급한다."""
    import traceback  # 디버깅용 — 원인 찾으면 지울 것

    try:
        conn = get_conn()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT inquiry_id, inquiry_type, company, contact_name, email, phone
                       FROM contact_inquiries WHERE inquiry_id = %s""",
                    (inquiry_id,),
                )
                inquiry = cur.fetchone()
                if not inquiry:
                    raise HTTPException(status_code=404, detail="해당 문의를 찾을 수 없습니다.")

                cur.execute(
                    "UPDATE contact_inquiries SET inquiry_status = %s WHERE inquiry_id = %s",
                    (body.status, inquiry_id),
                )
            conn.commit()

        account_created = False
        if body.status == "done" and inquiry["inquiry_type"] == "enterprise":
            provisioned = _provision_enterprise_account(inquiry)
            if provisioned:
                account_created = True
                try:
                    await run_in_threadpool(
                        _send_enterprise_account_email,
                        inquiry.get("company"),
                        provisioned["email"],
                        provisioned["user_id"],
                        provisioned["temp_password"],
                    )
                except RuntimeError as e:
                    print(f"[enterprise-provision] 메일 발송 실패: {e}")

        return {
            "message": "문의 상태가 변경되었습니다.",
            "inquiry_id": inquiry_id,
            "status": body.status,
            "account_created": account_created,
        }
    except HTTPException:
        raise
    except Exception as e:
        print("=" * 60)
        print("[DEBUG] 문의 상태 변경 중 에러 발생:")
        traceback.print_exc()
        print("=" * 60)
        raise HTTPException(status_code=500, detail=f"DEBUG: {type(e).__name__}: {e}")