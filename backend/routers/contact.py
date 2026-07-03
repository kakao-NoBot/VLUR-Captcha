from fastapi import APIRouter, Depends
from pydantic import BaseModel
from auth.deps import get_current_admin
from db import get_conn

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
