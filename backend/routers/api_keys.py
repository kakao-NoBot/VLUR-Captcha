# api_keys.py

import hashlib
import ipaddress
import re
import secrets
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.deps import get_current_admin, get_current_user
from db import get_conn


router = APIRouter(tags=["api-keys"])

API_KEY_PREFIX = "sk-aicap_prod_"
SITE_KEY_PREFIX = "pk-aicap_prod_"
DOMAIN_LABEL_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")

# 관리자가 API Key에 부여할 수 있는 상태 값.
ADMIN_ASSIGNABLE_KEY_STATUSES = ("active", "inactive")


def _generate_api_key() -> str:
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def _generate_site_key() -> str:
    return f"{SITE_KEY_PREFIX}{secrets.token_urlsafe(24)}"


def _normalize_site_domain(site_domain: str) -> str:
    """프로토콜·경로·포트를 제외한 허용 호스트명만 저장한다."""
    value = site_domain.strip()
    has_scheme = "://" in value
    parsed = urlsplit(value if has_scheme else f"//{value}")

    try:
        parsed.port
    except ValueError:
        parsed = None

    if (
        not parsed
        or (has_scheme and parsed.scheme.lower() not in ("http", "https"))
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="사이트 도메인은 example.com 형식의 호스트명으로 입력해 주세요.",
        )

    try:
        hostname = parsed.hostname.encode("idna").decode("ascii").lower().rstrip(".")
    except UnicodeError:
        hostname = ""

    try:
        ipaddress.ip_address(hostname)
        is_valid_hostname = True
    except ValueError:
        labels = hostname.split(".")
        is_valid_hostname = (
            hostname == "localhost"
            or (
                len(hostname) <= 253
                and len(labels) >= 2
                and all(DOMAIN_LABEL_PATTERN.fullmatch(label) for label in labels)
            )
        )

    if not is_valid_hostname:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="사이트 도메인은 example.com 형식의 호스트명으로 입력해 주세요.",
        )
    return hostname


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
        "site_key": row["site_key"],
        "site_domain": row["site_domain"],
        "created_at": row["created_at"],
        "expired_at": row["expired_at"],
        "is_active": bool(row["is_active"]),
    }


def _issue_api_key(user_id: str, replace: bool, site_domain: str) -> dict:
    api_key = _generate_api_key()
    api_key_hash = _hash_api_key(api_key)
    masked_key = _mask_api_key(api_key)
    site_key = _generate_site_key()

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.plan_id, pl.plan_name, u.api_key_suspended
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s AND u.user_status = 'active'
                   FOR UPDATE""",
                (user_id,),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

            # 관리자가 API Key 사용을 제재한 계정은 재발급으로도 풀 수 없다.
            if user["api_key_suspended"]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="관리자에 의해 API Key 사용이 제한된 계정입니다.",
                )

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
                       (api_key_hash, user_id, plan_id, key_name, site_key, site_domain, created_at, expired_at, is_active)
                   VALUES (%s, %s, %s, %s, %s, %s, NOW(), NULL, TRUE)""",
                (api_key_hash, user_id, user["plan_id"], masked_key, site_key, site_domain),
            )
            api_key_id = cur.lastrowid
            cur.execute(
                """SELECT api_key_id, key_name, site_key, site_domain, created_at, expired_at, is_active
                   FROM api_keys WHERE api_key_id = %s""",
                (api_key_id,),
            )
            created = cur.fetchone()
        conn.commit()

    return {
        "plain_key": api_key,
        "site_key": site_key,
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

            # is_active 컬럼을 그대로 신뢰 소스로 사용한다 (관리자가 직접 제어하는 값).
            cur.execute(
                """SELECT api_key_id, key_name, site_key, site_domain, created_at, expired_at, is_active
                   FROM api_keys
                   WHERE user_id = %s
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


class SiteDomainRequest(BaseModel):
    site_domain: str


@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
def issue_api_key(
    body: SiteDomainRequest,
    current_user: dict = Depends(get_current_user),
):
    """첫 API Key를 발급한다. 원문은 이 응답에서만 반환한다."""
    return _issue_api_key(
        current_user["sub"],
        replace=False,
        site_domain=_normalize_site_domain(body.site_domain),
    )


class ReissueRequest(BaseModel):
    site_domain: str
    target: str = "both"  # 'secret' | 'site' | 'both'


def _reissue_secret_key(user_id: str) -> dict:
    """Secret Key만 재발급하고 Site Key/도메인은 그대로 유지한다.
    site_key가 전역 UNIQUE 제약이라 새 행을 만들면 기존 값과 충돌하므로,
    기존 활성 행을 그 자리에서 UPDATE한다 (Site Key 재발급과 동일한 방식)."""
    new_secret = _generate_api_key()
    api_key_hash = _hash_api_key(new_secret)
    masked_key = _mask_api_key(new_secret)

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.plan_id, pl.plan_name, u.api_key_suspended
                   FROM users u LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s AND u.user_status = 'active' FOR UPDATE""",
                (user_id,),
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
            if user["api_key_suspended"]:
                raise HTTPException(status_code=403, detail="관리자에 의해 API Key 사용이 제한된 계정입니다.")
            if not user["plan_id"]:
                raise HTTPException(status_code=403, detail="요금제를 먼저 활성화해 주세요.")

            cur.execute(
                """SELECT api_key_id, site_key, site_domain FROM api_keys
                   WHERE user_id = %s AND is_active = TRUE
                     AND (expired_at IS NULL OR expired_at > NOW())
                   ORDER BY api_key_id DESC LIMIT 1 FOR UPDATE""",
                (user_id,),
            )
            active_key = cur.fetchone()
            if not active_key:
                raise HTTPException(status_code=404, detail="활성 API Key가 없습니다.")

            # 같은 행을 그대로 UPDATE — site_key/site_domain은 건드리지 않는다
            cur.execute(
                """UPDATE api_keys SET api_key_hash = %s, key_name = %s, created_at = NOW()
                   WHERE api_key_id = %s""",
                (api_key_hash, masked_key, active_key["api_key_id"]),
            )
            cur.execute(
                """SELECT api_key_id, key_name, site_key, site_domain, created_at, expired_at, is_active
                   FROM api_keys WHERE api_key_id = %s""",
                (active_key["api_key_id"],),
            )
            updated = cur.fetchone()
        conn.commit()

    return {
        "plain_key": new_secret,
        "site_key": active_key["site_key"],
        "api_key": _serialize_api_key(updated),
        "plan_name": user["plan_name"],
    }


def _reissue_site_key(user_id: str, site_domain: str | None) -> dict:
    """Site Key만 재발급하고 Secret Key(해시)는 그대로 유지한다.
    site_domain이 None이면 기존 도메인 값(빈 값 포함)을 그대로 둔다."""
    new_site_key = _generate_site_key()

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT api_key_id, site_domain FROM api_keys
                   WHERE user_id = %s AND is_active = TRUE
                   ORDER BY api_key_id DESC LIMIT 1 FOR UPDATE""",
                (user_id,),
            )
            active_key = cur.fetchone()
            if not active_key:
                raise HTTPException(status_code=404, detail="활성 API Key가 없습니다.")

            final_domain = site_domain if site_domain is not None else active_key["site_domain"]

            # 같은 행을 그대로 UPDATE — Secret Key 해시는 건드리지 않는다
            cur.execute(
                "UPDATE api_keys SET site_key = %s, site_domain = %s WHERE api_key_id = %s",
                (new_site_key, final_domain, active_key["api_key_id"]),
            )
            cur.execute(
                """SELECT api_key_id, key_name, site_key, site_domain, created_at, expired_at, is_active
                   FROM api_keys WHERE api_key_id = %s""",
                (active_key["api_key_id"],),
            )
            updated = cur.fetchone()
        conn.commit()

    return {
        "plain_key": None,
        "site_key": new_site_key,
        "api_key": _serialize_api_key(updated),
    }


@router.post("/api-keys/reissue", status_code=status.HTTP_201_CREATED)
def reissue_api_key(
    body: ReissueRequest,
    current_user: dict = Depends(get_current_user),
):
    """target에 따라 Secret Key 또는 Site Key만 선택적으로 재발급한다.
    Site Key 재발급은 도메인 등록 여부와 무관하게 항상 허용한다."""
    if body.target == "secret":
        # 도메인 값은 서버 검증용 키와 무관하므로 그대로 유지
        return _reissue_secret_key(current_user["sub"])
    elif body.target == "site":
        # 도메인이 비어있으면 검증하지 않고 기존 값(빈 값 포함)을 그대로 유지
        normalized_domain = (
            _normalize_site_domain(body.site_domain) if body.site_domain.strip() else None
        )
        return _reissue_site_key(current_user["sub"], normalized_domain)
    else:
        # 하위 호환: target 없으면 기존 동작(둘 다 재발급) — 이 경로만 도메인 필수
        site_domain = _normalize_site_domain(body.site_domain)
        return _issue_api_key(current_user["sub"], replace=True, site_domain=site_domain)


@router.put("/api-keys/current/site-domain")
def update_current_api_key_site_domain(
    body: SiteDomainRequest,
    current_user: dict = Depends(get_current_user),
):
    """발급된 Site Key의 허용 호스트명을 변경한다."""
    site_domain = _normalize_site_domain(body.site_domain)
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT api_key_id FROM api_keys
                   WHERE user_id = %s AND is_active = TRUE
                   ORDER BY api_key_id DESC
                   LIMIT 1
                   FOR UPDATE""",
                (current_user["sub"],),
            )
            api_key = cur.fetchone()
            if not api_key:
                raise HTTPException(status_code=404, detail="활성 API Key를 찾을 수 없습니다.")

            cur.execute(
                "UPDATE api_keys SET site_domain = %s WHERE api_key_id = %s",
                (site_domain, api_key["api_key_id"]),
            )
            cur.execute(
                """SELECT api_key_id, key_name, site_key, site_domain, created_at, expired_at, is_active
                   FROM api_keys WHERE api_key_id = %s""",
                (api_key["api_key_id"],),
            )
            updated = cur.fetchone()
        conn.commit()

    return {"api_key": _serialize_api_key(updated)}


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
                          ak.created_at AS api_key_created_at,
                          ak.is_active AS api_key_active
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
                       ORDER BY inner_ak.api_key_id DESC
                       LIMIT 1
                   )
                   WHERE u.role = 'user' AND u.user_status <> 'deleted'
                   ORDER BY u.created_at DESC"""
            )
            users = cur.fetchall()

    return {"users": users}


class UpdateApiKeyStatusRequest(BaseModel):
    status: str  # 'active' | 'inactive'


@router.patch("/admin/users/{user_id}/api-key-status")
def update_user_api_key_status(
    user_id: str,
    body: UpdateApiKeyStatusRequest,
    admin: dict = Depends(get_current_admin),
):
    if body.status not in ADMIN_ASSIGNABLE_KEY_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status는 'active' 또는 'inactive'만 가능합니다.",
        )

    make_active = body.status == "active"

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM users WHERE user_id = %s",
                (user_id,),
            )
            target = cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
            if target["role"] != "user":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="관리자 계정의 API Key는 제어할 수 없습니다.",
                )

            # 관리자 제재 플래그를 users 테이블에 기록 — 사용자의 재발급으로는 풀리지 않는다.
            cur.execute(
                "UPDATE users SET api_key_suspended = %s WHERE user_id = %s",
                (not make_active, user_id),
            )

            if not make_active:
                cur.execute(
                    """UPDATE api_keys
                       SET is_active = FALSE, expired_at = NOW()
                       WHERE user_id = %s AND is_active = TRUE""",
                    (user_id,),
                )
                # rowcount 체크는 제거하거나 완화: 이미 비활성 상태에서 다시 눌러도 플래그는 세팅되게
            else:
                cur.execute(
                    """SELECT api_key_id FROM api_keys
                       WHERE user_id = %s AND is_active = FALSE
                       ORDER BY api_key_id DESC
                       LIMIT 1""",
                    (user_id,),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """UPDATE api_keys
                           SET is_active = TRUE, expired_at = NULL
                           WHERE api_key_id = %s""",
                        (row["api_key_id"],),
                    )
        conn.commit()

    return {"user_id": user_id, "api_key_active": make_active}
