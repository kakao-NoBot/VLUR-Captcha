import hashlib
import os
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.deps import get_current_user
from db import get_conn
from services.kakaopay import (
    KakaoPayAPIError,
    KakaoPayConfigurationError,
    approve_payment,
    ready_payment,
)


router = APIRouter(prefix="/payments", tags=["payments"])

PAYMENT_PLANS = {
    "Pro": {
        "item_name": "VLUR CAPTCHA Pro 요금제 (1개월)",
        "total_amount": 89000,
    },
}


class KakaoPayReadyRequest(BaseModel):
    plan_name: str


class KakaoPayApproveRequest(BaseModel):
    order_id: str
    pg_token: str


class KakaoPayCloseRequest(BaseModel):
    order_id: str
    result: Literal["cancelled", "failed"]


def _partner_user_id(user_id: str) -> str:
    return hashlib.sha256(f"kakaopay:{user_id}".encode()).hexdigest()[:40]


def _mark_payment(order_id: str, user_id: str, payment_status: str):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE payments SET payment_status = %s
                   WHERE pg_provider = 'kakao' AND pg_provider_id = %s
                     AND user_id = %s AND payment_status = 'pending'""",
                (payment_status, order_id, user_id),
            )
        conn.commit()


@router.post("/kakao/ready")
async def kakao_pay_ready(
    body: KakaoPayReadyRequest,
    current_user: dict = Depends(get_current_user),
):
    plan_config = PAYMENT_PLANS.get(body.plan_name)
    if not plan_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="카카오페이로 결제할 수 없는 요금제입니다.",
        )

    user_id = current_user["sub"]
    order_id = f"vlur_{uuid.uuid4().hex[:24]}"
    frontend_url = os.getenv("KAKAOPAY_FRONTEND_URL", "http://localhost:5173").rstrip("/")

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT plan_id FROM plans WHERE plan_name = %s LIMIT 1",
                (body.plan_name,),
            )
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="요금제 정보를 찾을 수 없습니다.",
                )
            cur.execute(
                """INSERT INTO payments
                   (user_id, plan_id, amount, pg_provider, pg_provider_id, payment_status)
                   VALUES (%s, %s, %s, 'kakao', %s, 'pending')""",
                (user_id, plan["plan_id"], plan_config["total_amount"], order_id),
            )
        conn.commit()

    try:
        ready = await ready_payment({
            "partner_order_id": order_id,
            "partner_user_id": _partner_user_id(user_id),
            "item_name": plan_config["item_name"],
            "quantity": 1,
            "total_amount": plan_config["total_amount"],
            "tax_free_amount": 0,
            "approval_url": f"{frontend_url}/payments/kakao/success/{order_id}",
            "cancel_url": f"{frontend_url}/payments/kakao/cancel/{order_id}",
            "fail_url": f"{frontend_url}/payments/kakao/fail/{order_id}",
        })
    except KakaoPayConfigurationError as exc:
        _mark_payment(order_id, user_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except KakaoPayAPIError as exc:
        _mark_payment(order_id, user_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    tid = ready.get("tid")
    redirect_url = ready.get("next_redirect_pc_url")
    if not tid or not redirect_url:
        _mark_payment(order_id, user_id, "failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="카카오페이 결제 준비 응답이 올바르지 않습니다.",
        )

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE payments SET pg_payment_key = %s
                   WHERE pg_provider = 'kakao' AND pg_provider_id = %s
                     AND user_id = %s AND payment_status = 'pending'""",
                (tid, order_id, user_id),
            )
        conn.commit()

    return {"order_id": order_id, "redirect_url": redirect_url}


@router.post("/kakao/approve")
async def kakao_pay_approve(
    body: KakaoPayApproveRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.payment_id, p.plan_id, p.amount, p.pg_payment_key,
                          p.payment_status, pl.plan_name
                   FROM payments p
                   JOIN plans pl ON pl.plan_id = p.plan_id
                   WHERE p.pg_provider = 'kakao' AND p.pg_provider_id = %s
                     AND p.user_id = %s""",
                (body.order_id, user_id),
            )
            payment = cur.fetchone()

    if not payment:
        raise HTTPException(status_code=404, detail="결제 주문을 찾을 수 없습니다.")
    if payment["payment_status"] == "paid":
        return {
            "status": "paid",
            "order_id": body.order_id,
            "plan_name": payment["plan_name"],
            "amount": int(payment["amount"]),
        }
    if payment["payment_status"] != "pending" or not payment["pg_payment_key"]:
        raise HTTPException(status_code=409, detail="승인할 수 없는 결제 상태입니다.")

    try:
        approved = await approve_payment({
            "tid": payment["pg_payment_key"],
            "partner_order_id": body.order_id,
            "partner_user_id": _partner_user_id(user_id),
            "pg_token": body.pg_token,
            "total_amount": int(payment["amount"]),
        })
    except KakaoPayConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except KakaoPayAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    approved_amount = int((approved.get("amount") or {}).get("total") or 0)
    if approved.get("tid") != payment["pg_payment_key"] or approved_amount != int(payment["amount"]):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="카카오페이 승인 정보와 주문 정보가 일치하지 않습니다.",
        )

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE payments
                   SET payment_status = 'paid', paid_at = NOW()
                   WHERE payment_id = %s AND payment_status = 'pending'""",
                (payment["payment_id"],),
            )
            if cur.rowcount != 1:
                raise HTTPException(status_code=409, detail="이미 처리된 결제입니다.")
            cur.execute(
                """UPDATE users
                   SET plan_id = %s, subscription_date = NOW()
                   WHERE user_id = %s""",
                (payment["plan_id"], user_id),
            )
        conn.commit()

    return {
        "status": "paid",
        "order_id": body.order_id,
        "plan_name": payment["plan_name"],
        "amount": approved_amount,
        "approved_at": approved.get("approved_at"),
    }


@router.get("/kakao/latest")
def kakao_pay_latest(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.pg_provider_id, p.payment_status, p.amount, pl.plan_name
                   FROM payments p
                   JOIN plans pl ON pl.plan_id = p.plan_id
                   WHERE p.pg_provider = 'kakao' AND p.user_id = %s
                   ORDER BY p.payment_id DESC
                   LIMIT 1""",
                (current_user["sub"],),
            )
            payment = cur.fetchone()

    if not payment:
        raise HTTPException(status_code=404, detail="최근 결제 주문을 찾을 수 없습니다.")

    return {
        "status": payment["payment_status"],
        "order_id": payment["pg_provider_id"],
        "plan_name": payment["plan_name"],
        "amount": int(payment["amount"]),
    }


@router.post("/kakao/close")
def kakao_pay_close(
    body: KakaoPayCloseRequest,
    current_user: dict = Depends(get_current_user),
):
    _mark_payment(body.order_id, current_user["sub"], body.result)
    return {"status": body.result}
