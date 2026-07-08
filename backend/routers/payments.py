import hashlib
import os
import uuid
from typing import Literal
from datetime import datetime

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
from services.tosspayments import (
    TossPaymentsAPIError,
    TossPaymentsConfigurationError,
    confirm_payment,
    get_client_key,
)


router = APIRouter(prefix="/payments", tags=["payments"])

PAYMENT_PLANS = {
    "Pro": {
        "item_name": "VLUR CAPTCHA Pro 요금제 (1개월)",
        "order_name": "VLUR CAPTCHA Pro 요금제 (1개월)",
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


class TossReadyRequest(BaseModel):
    plan_name: str


class TossConfirmRequest(BaseModel):
    order_id: str
    payment_key: str
    amount: int


class TossCloseRequest(BaseModel):
    order_id: str
    result: Literal["cancelled", "failed"]


class CancelSubscriptionRequest(BaseModel):
    confirmation: str


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


def _toss_customer_key(user_id: str) -> str:
    return hashlib.sha256(f"toss:{user_id}".encode()).hexdigest()[:40]


def _mark_toss_payment(order_id: str, user_id: str, payment_status: str):
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


def _find_toss_payment(order_id: str, user_id: str):
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


def _toss_payment_response(payment: dict, order_id: str) -> dict:
    return {
        "status": payment["payment_status"],
        "order_id": order_id,
        "plan_name": payment["plan_name"],
        "amount": int(payment["amount"]),
    }


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


@router.post("/free/activate")
def activate_free_plan(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT plan_id FROM plans WHERE plan_name = 'Basic' LIMIT 1")
            plan = cur.fetchone()
            if not plan:
                raise HTTPException(status_code=404, detail="Basic 요금제를 찾을 수 없습니다.")
            cur.execute(
                "UPDATE users SET plan_id = %s, subscription_date = NOW() WHERE user_id = %s",
                (plan["plan_id"], current_user["sub"]),
            )
        conn.commit()
    return {"plan_name": "Basic"}


PG_PROVIDER_LABEL = {
    "kakao": "카카오페이",
    "toss": "토스페이먼츠",
}


@router.get("/history")
def payment_history(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.payment_id, p.paid_at, p.amount, p.pg_provider, pl.plan_name
                   FROM payments p
                   JOIN plans pl ON pl.plan_id = p.plan_id
                   WHERE p.user_id = %s AND p.payment_status = 'paid'
                   ORDER BY p.paid_at DESC""",
                (current_user["sub"],),
            )
            rows = cur.fetchall()

    return {
        "payments": [
            {
                "payment_id": row["payment_id"],
                "date": row["paid_at"].strftime("%Y-%m-%d") if row["paid_at"] else None,
                "plan_name": row["plan_name"],
                "amount": int(row["amount"]),
                "provider": row["pg_provider"],
                "method": PG_PROVIDER_LABEL.get(row["pg_provider"], row["pg_provider"]),
                "status": "완료",
            }
            for row in rows
        ]
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
        "customer_key": _toss_customer_key(user_id),
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
    payment = _find_toss_payment(body.order_id, user_id)
    if not payment:
        raise HTTPException(status_code=404, detail="결제 주문을 찾을 수 없습니다.")
    if payment["payment_status"] == "paid":
        return _toss_payment_response(payment, body.order_id)
    if payment["payment_status"] != "pending":
        raise HTTPException(status_code=409, detail="승인할 수 없는 결제 상태입니다.")

    expected_amount = int(payment["amount"])
    if body.amount != expected_amount:
        _mark_toss_payment(body.order_id, user_id, "failed")
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
    return _toss_payment_response(payment, body.order_id)


@router.get("/toss/status/{order_id}")
def toss_pay_status(
    order_id: str,
    current_user: dict = Depends(get_current_user),
):
    payment = _find_toss_payment(order_id, current_user["sub"])
    if not payment:
        raise HTTPException(status_code=404, detail="결제 주문을 찾을 수 없습니다.")
    return _toss_payment_response(payment, order_id)


@router.post("/toss/close")
def toss_pay_close(
    body: TossCloseRequest,
    current_user: dict = Depends(get_current_user),
):
    _mark_toss_payment(body.order_id, current_user["sub"], body.result)
    return {"status": body.result}


def _add_one_month(dt):
    year = dt.year + (dt.month // 12)
    month = dt.month % 12 + 1
    day = min(dt.day, 28)
    return dt.replace(year=year, month=month, day=day)


@router.post("/schedule-downgrade")
def schedule_downgrade(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.plan_id, pl.plan_name
                   FROM users u JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s""",
                (user_id,),
            )
            user_plan = cur.fetchone()
            if not user_plan or user_plan["plan_name"] != "Pro":
                raise HTTPException(status_code=400, detail="Pro 요금제 사용자만 다운그레이드를 예약할 수 있습니다.")

            cur.execute("SELECT plan_id FROM plans WHERE plan_name = 'Basic' LIMIT 1")
            basic_plan = cur.fetchone()
            if not basic_plan:
                raise HTTPException(status_code=404, detail="Basic 요금제를 찾을 수 없습니다.")

            cur.execute(
                """SELECT paid_at FROM payments
                   WHERE user_id = %s AND plan_id = %s AND payment_status = 'paid'
                   ORDER BY paid_at DESC LIMIT 1""",
                (user_id, user_plan["plan_id"]),
            )
            latest = cur.fetchone()
            base_date = latest["paid_at"] if latest and latest["paid_at"] else datetime.utcnow()
            effective_date = _add_one_month(base_date)

            cur.execute(
                """UPDATE users SET pending_plan_id = %s, plan_change_at = %s WHERE user_id = %s""",
                (basic_plan["plan_id"], effective_date, user_id),
            )
        conn.commit()

    return {"scheduled": True, "effective_date": effective_date.strftime("%Y-%m-%d")}


def apply_pending_plan_change(user_id: str):
    """예약된 다운그레이드/해지 시점이 지났으면 실제로 반영. auth.py의 /auth/me 등에서 매 요청마다 호출."""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pending_plan_id, plan_change_at, cancel_at FROM users WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                return

            now = datetime.utcnow()

            if row["cancel_at"] and row["cancel_at"] <= now:
                cur.execute(
                    """UPDATE users
                       SET plan_id = NULL, pending_plan_id = NULL, plan_change_at = NULL,
                           cancel_at = NULL, api_key_suspended = 1
                       WHERE user_id = %s""",
                    (user_id,),
                )
                conn.commit()
                return

            if row["pending_plan_id"] and row["plan_change_at"] and row["plan_change_at"] <= now:
                cur.execute(
                    """UPDATE users SET plan_id = pending_plan_id, pending_plan_id = NULL,
                           plan_change_at = NULL, subscription_date = NOW()
                       WHERE user_id = %s""",
                    (user_id,),
                )
                conn.commit()


@router.post("/cancel-scheduled-downgrade")
def cancel_scheduled_downgrade(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pending_plan_id FROM users WHERE user_id = %s",
                (current_user["sub"],),
            )
            row = cur.fetchone()
            if not row or not row["pending_plan_id"]:
                raise HTTPException(status_code=400, detail="예약된 요금제 변경이 없습니다.")

            cur.execute(
                "UPDATE users SET pending_plan_id = NULL, plan_change_at = NULL WHERE user_id = %s",
                (current_user["sub"],),
            )
        conn.commit()
    return {"cancelled": True}


@router.post("/cancel-subscription")
def cancel_subscription(
    body: CancelSubscriptionRequest,
    current_user: dict = Depends(get_current_user),
):
    if body.confirmation.strip() != "해지":
        raise HTTPException(status_code=400, detail="'해지'를 정확히 입력해주세요.")

    user_id = current_user["sub"]
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT plan_id FROM users WHERE user_id = %s",
                (user_id,),
            )
            user_row = cur.fetchone()
            if not user_row or not user_row["plan_id"]:
                raise HTTPException(status_code=400, detail="해지할 구독이 없습니다.")

            cur.execute(
                """SELECT paid_at FROM payments
                   WHERE user_id = %s AND plan_id = %s AND payment_status = 'paid'
                   ORDER BY paid_at DESC LIMIT 1""",
                (user_id, user_row["plan_id"]),
            )
            latest = cur.fetchone()
            base_date = latest["paid_at"] if latest and latest["paid_at"] else datetime.utcnow()
            effective_date = _add_one_month(base_date)

            # 해지 예약이 다운그레이드 예약보다 우선하므로 기존 다운그레이드 예약은 정리
            cur.execute(
                """UPDATE users
                   SET pending_plan_id = NULL, plan_change_at = NULL, cancel_at = %s
                   WHERE user_id = %s""",
                (effective_date, user_id),
            )
        conn.commit()

    return {"scheduled": True, "effective_date": effective_date.strftime("%Y-%m-%d")}


@router.post("/cancel-scheduled-cancellation")
def cancel_scheduled_cancellation(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT cancel_at FROM users WHERE user_id = %s", (current_user["sub"],))
            row = cur.fetchone()
            if not row or not row["cancel_at"]:
                raise HTTPException(status_code=400, detail="예약된 해지가 없습니다.")
            cur.execute(
                "UPDATE users SET cancel_at = NULL WHERE user_id = %s",
                (current_user["sub"],),
            )
        conn.commit()
    return {"cancelled": True}