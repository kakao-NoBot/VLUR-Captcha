import hashlib
import os
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.deps import get_current_user
from db import get_conn
from services.tosspayments import (
    TossPaymentsAPIError,
    TossPaymentsConfigurationError,
    confirm_payment,
    get_client_key,
)


router = APIRouter(prefix="/payments", tags=["payments"])

PAYMENT_PLANS = {
    "Pro": {
        "order_name": "VLUR CAPTCHA Pro 요금제 (1개월)",
        "total_amount": 89000,
    },
}


class TossReadyRequest(BaseModel):
    plan_name: str


class TossConfirmRequest(BaseModel):
    order_id: str
    payment_key: str
    amount: int


class TossCloseRequest(BaseModel):
    order_id: str
    result: Literal["cancelled", "failed"]


def _customer_key(user_id: str) -> str:
    return hashlib.sha256(f"toss:{user_id}".encode()).hexdigest()[:40]


def _mark_payment(order_id: str, user_id: str, payment_status: str):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE payments SET payment_status = %s
                   WHERE pg_provider = 'toss' AND pg_provider_id = %s
                     AND user_id = %s AND payment_status = 'pending'""",
                (payment_status, order_id, user_id),
            )
        conn.commit()


def _find_payment(order_id: str, user_id: str):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.payment_id, p.plan_id, p.amount, p.pg_payment_key,
                          p.payment_status, pl.plan_name
                   FROM payments p
                   JOIN plans pl ON pl.plan_id = p.plan_id
                   WHERE p.pg_provider = 'toss' AND p.pg_provider_id = %s
                     AND p.user_id = %s""",
                (order_id, user_id),
            )
            return cur.fetchone()


def _payment_response(payment: dict, order_id: str) -> dict:
    return {
        "status": payment["payment_status"],
        "order_id": order_id,
        "plan_name": payment["plan_name"],
        "amount": int(payment["amount"]),
    }


@router.post("/toss/ready")
def toss_pay_ready(
    body: TossReadyRequest,
    current_user: dict = Depends(get_current_user),
):
    plan_config = PAYMENT_PLANS.get(body.plan_name)
    if not plan_config:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="토스페이먼츠로 결제할 수 없는 요금제입니다.",
        )

    try:
        client_key = get_client_key()
    except TossPaymentsConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    user_id = current_user["sub"]
    order_id = f"vlur_toss_{uuid.uuid4().hex[:24]}"
    frontend_url = os.getenv("TOSS_FRONTEND_URL", "http://localhost:5173").rstrip("/")

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT plan_id FROM plans WHERE plan_name = %s LIMIT 1",
                (body.plan_name,),
            )
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=404, detail="요금제 정보를 찾을 수 없습니다.")
            cur.execute(
                """INSERT INTO payments
                   (user_id, plan_id, amount, pg_provider, pg_provider_id, payment_status)
                   VALUES (%s, %s, %s, 'toss', %s, 'pending')""",
                (user_id, plan["plan_id"], plan_config["total_amount"], order_id),
            )
        conn.commit()

    return {
        "client_key": client_key,
        "customer_key": _customer_key(user_id),
        "order_id": order_id,
        "order_name": plan_config["order_name"],
        "amount": plan_config["total_amount"],
        "success_url": f"{frontend_url}/payments/toss/success/{order_id}",
        "fail_url": f"{frontend_url}/payments/toss/fail/{order_id}",
    }


@router.post("/toss/confirm")
async def toss_pay_confirm(
    body: TossConfirmRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["sub"]
    payment = _find_payment(body.order_id, user_id)
    if not payment:
        raise HTTPException(status_code=404, detail="결제 주문을 찾을 수 없습니다.")
    if payment["payment_status"] == "paid":
        return _payment_response(payment, body.order_id)
    if payment["payment_status"] != "pending":
        raise HTTPException(status_code=409, detail="승인할 수 없는 결제 상태입니다.")

    expected_amount = int(payment["amount"])
    if body.amount != expected_amount:
        _mark_payment(body.order_id, user_id, "failed")
        raise HTTPException(status_code=400, detail="결제 금액이 주문 정보와 일치하지 않습니다.")

    try:
        approved = await confirm_payment(
            {
                "paymentKey": body.payment_key,
                "orderId": body.order_id,
                "amount": expected_amount,
            },
            idempotency_key=f"toss-confirm-{body.order_id}",
        )
    except TossPaymentsConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TossPaymentsAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if (
        approved.get("orderId") != body.order_id
        or int(approved.get("totalAmount") or 0) != expected_amount
        or approved.get("status") != "DONE"
    ):
        raise HTTPException(
            status_code=502,
            detail="토스페이먼츠 승인 정보와 주문 정보가 일치하지 않습니다.",
        )

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE payments
                   SET payment_status = 'paid', pg_payment_key = %s, paid_at = NOW()
                   WHERE payment_id = %s AND payment_status = 'pending'""",
                (body.payment_key, payment["payment_id"]),
            )
            if cur.rowcount != 1:
                raise HTTPException(status_code=409, detail="이미 처리된 결제입니다.")
            cur.execute(
                """UPDATE users SET plan_id = %s, subscription_date = NOW()
                   WHERE user_id = %s""",
                (payment["plan_id"], user_id),
            )
        conn.commit()

    payment["payment_status"] = "paid"
    return _payment_response(payment, body.order_id)


@router.get("/toss/status/{order_id}")
def toss_pay_status(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    payment = _find_payment(order_id, current_user["sub"])
    if not payment:
        raise HTTPException(status_code=404, detail="결제 주문을 찾을 수 없습니다.")
    return _payment_response(payment, order_id)


@router.post("/toss/close")
def toss_pay_close(
    body: TossCloseRequest,
    current_user: dict = Depends(get_current_user),
):
    _mark_payment(body.order_id, current_user["sub"], body.result)
    return {"status": body.result}
