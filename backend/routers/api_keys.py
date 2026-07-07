# api_keys.py

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.deps import get_current_admin, get_current_user
from db import get_conn


router = APIRouter(tags=["api-keys"])

API_KEY_PREFIX = "sk-aicap_prod_"

# 관리자가 부여할 수 있는 상태 값. 'deleted'(탈퇴)는 사용자 본인 탈퇴 절차 전용이라 제외한다.
ADMIN_ASSIGNABLE_USER_STATUSES = ("active", "inactive")


def _generate_api_key() -> str:
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def _hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


def _mask_api_key(api_key: str) -> str:
    return f"{api_key[:20]}••••••••{api_key[-4:]}"


def _serialize_api_key(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": row["api_key_id"],
        "masked_key": row["key_name"] or "마스킹 정보 없음",
        "created_at": row["created_at"],
        "expired_at": row["expired_at"],
        "is_active": bool(row["is_active"]),
    }


def _issue_api_key(user_id: str, replace: bool) -> dict:
    api_key = _generate_api_key()
    api_key_hash = _hash_api_key(api_key)
    masked_key = _mask_api_key(api_key)

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            # 사용자 행을 잠가 동일 사용자의 동시 발급/재발급을 직렬화한다.
            cur.execute(
                """SELECT u.plan_id, pl.plan_name
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s AND u.user_status = 'active'
                   FOR UPDATE""",
                (user_id,),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
            if not user["plan_id"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="요금제를 먼저 활성화해 주세요.",
                )

            cur.execute(
                """SELECT api_key_id
                   FROM api_keys
                   WHERE user_id = %s AND is_active = TRUE
                     AND (expired_at IS NULL OR expired_at > NOW())
                   ORDER BY api_key_id DESC
                   LIMIT 1""",
                (user_id,),
            )
            active_key = cur.fetchone()

            if active_key and not replace:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 사용 중인 API Key가 있습니다.",
                )

            if replace:
                cur.execute(
                    """UPDATE api_keys
                       SET is_active = FALSE, expired_at = NOW()
                       WHERE user_id = %s AND is_active = TRUE""",
                    (user_id,),
                )

            cur.execute(
                """INSERT INTO api_keys
                       (api_key_hash, user_id, plan_id, key_name, created_at, expired_at, is_active)
                   VALUES (%s, %s, %s, %s, NOW(), NULL, TRUE)""",
                (api_key_hash, user_id, user["plan_id"], masked_key),
            )
            api_key_id = cur.lastrowid
            cur.execute(
                """SELECT api_key_id, key_name, created_at, expired_at, is_active
                   FROM api_keys WHERE api_key_id = %s""",
                (api_key_id,),
            )
            created = cur.fetchone()
        conn.commit()

    return {
        "plain_key": api_key,
        "api_key": _serialize_api_key(created),
        "plan_name": user["plan_name"],
    }


@router.get("/api-keys/current")
def get_current_api_key(current_user: dict = Depends(get_current_user)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.plan_id, u.subscription_date, pl.plan_name
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s""",
                (current_user["sub"],),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

            cur.execute(
                """SELECT api_key_id, key_name, created_at, expired_at, is_active
                   FROM api_keys
                   WHERE user_id = %s AND is_active = TRUE
                     AND (expired_at IS NULL OR expired_at > NOW())
                   ORDER BY api_key_id DESC
                   LIMIT 1""",
                (current_user["sub"],),
            )
            api_key = cur.fetchone()

    plan = None
    if user["plan_id"]:
        plan = {
            "id": user["plan_id"],
            "name": user["plan_name"],
            "activated_at": user["subscription_date"],
        }

    return {"plan": plan, "api_key": _serialize_api_key(api_key)}


@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
def issue_api_key(current_user: dict = Depends(get_current_user)):
    """첫 API Key를 발급한다. 원문은 이 응답에서만 반환한다."""
    return _issue_api_key(current_user["sub"], replace=False)


@router.post("/api-keys/reissue", status_code=status.HTTP_201_CREATED)
def reissue_api_key(current_user: dict = Depends(get_current_user)):
    """기존 활성 키를 만료시키고 새 키를 발급한다."""
    return _issue_api_key(current_user["sub"], replace=True)


@router.get("/admin/api-keys")
def list_users_with_api_keys(admin: dict = Depends(get_current_admin)):
    """관리자 전용 사용자/API Key 목록. 원문이나 해시는 반환하지 않는다."""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.user_id, u.user_name, u.email, u.company_name, u.contact_name,
                          u.user_status, u.created_at, pl.plan_name, pl.api_limit,
                          COALESCE(s.site_count, 0) AS site_count,
                          ak.api_key_id, ak.key_name AS masked_api_key,
                          ak.created_at AS api_key_created_at
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   LEFT JOIN (
                       SELECT user_id, COUNT(*) AS site_count
                       FROM client_sites
                       WHERE site_status <> 'archived'
                       GROUP BY user_id
                   ) s ON s.user_id = u.user_id
                   LEFT JOIN api_keys ak ON ak.api_key_id = (
                       SELECT inner_ak.api_key_id
                       FROM api_keys inner_ak
                       WHERE inner_ak.user_id = u.user_id
                         AND inner_ak.is_active = TRUE
                         AND (inner_ak.expired_at IS NULL OR inner_ak.expired_at > NOW())
                       ORDER BY inner_ak.api_key_id DESC
                       LIMIT 1
                   )
                   WHERE u.role = 'user' AND u.user_status <> 'deleted'
                   ORDER BY u.created_at DESC"""
            )
            users = cur.fetchall()

    return {"users": users}


class UpdateUserStatusRequest(BaseModel):
    status: str  # 'active' | 'inactive'


@router.patch("/admin/users/{user_id}/status")
def update_user_status(
    user_id: str,
    body: UpdateUserStatusRequest,
    admin: dict = Depends(get_current_admin),
):
    """관리자 전용 — 사용자 계정을 활성/비활성으로 전환한다.
    탈퇴(deleted) 계정이나 관리자(role='admin') 계정은 대상에서 제외한다."""
    if body.status not in ADMIN_ASSIGNABLE_USER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status는 'active' 또는 'inactive'만 가능합니다.",
        )

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role, user_status FROM users WHERE user_id = %s FOR UPDATE",
                (user_id,),
            )
            target = cur.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
            if target["role"] != "user":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="관리자 계정의 상태는 변경할 수 없습니다.",
                )
            if target["user_status"] == "deleted":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="이미 탈퇴한 계정입니다.",
                )

            cur.execute(
                "UPDATE users SET user_status = %s WHERE user_id = %s",
                (body.status, user_id),
            )

            # 계정을 비활성화하면 해당 사용자의 활성 API Key도 즉시 무효화한다.
            if body.status == "inactive":
                cur.execute(
                    """UPDATE api_keys
                       SET is_active = FALSE, expired_at = NOW()
                       WHERE user_id = %s AND is_active = TRUE""",
                    (user_id,),
                )
        conn.commit()

    return {"user_id": user_id, "user_status": body.status}