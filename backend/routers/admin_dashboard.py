# admin_dashboard.py
# 관리자 페이지의 대시보드/사이트 관리 탭이 쓰는 집계·목록 API.
# "사이트"는 client_sites(라우터·데이터 전혀 없음) 대신 실제로 채워지는
# api_keys(site_domain 1개 = 사용자당 활성 키 1개)를 그대로 노출한다.

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth.deps import get_current_admin
from db import get_conn
from services.datetime_format import format_seoul_datetime

router = APIRouter(tags=["admin-dashboard"])


@router.get("/admin/dashboard/summary")
def get_dashboard_summary(admin: dict = Depends(get_current_admin)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS total FROM users WHERE role = 'user' AND user_status <> 'deleted'"
            )
            total_users = int(cur.fetchone()["total"])

            cur.execute(
                """SELECT COALESCE(SUM(issued_count), 0) AS issued,
                          COALESCE(SUM(verified_count), 0) AS verified
                   FROM usage_daily_stats WHERE usage_date = CURDATE()"""
            )
            today = cur.fetchone()
            issued, verified = int(today["issued"]), int(today["verified"])
            success_rate = round(verified / issued * 100, 1) if issued else 0.0

            cur.execute(
                """SELECT SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_count,
                          COUNT(*) AS scored_count
                   FROM captcha_verifications
                   WHERE DATE(created_at) = CURDATE() AND is_bot IS NOT NULL"""
            )
            bot_row = cur.fetchone()
            scored = int(bot_row["scored_count"] or 0)
            bot_block_rate = round((bot_row["bot_count"] or 0) / scored * 100, 1) if scored else 0.0

    return {
        "total_users": total_users,
        "today_issued": issued,
        "today_verified": verified,
        "success_rate": success_rate,
        "bot_block_rate": bot_block_rate,
    }


@router.get("/admin/dashboard/bot-trend")
def get_bot_trend(days: int = 7, admin: dict = Depends(get_current_admin)):
    days = max(1, min(days, 30))
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT DATE(created_at) AS day,
                          SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_count,
                          COUNT(*) AS scored_count
                   FROM captcha_verifications
                   WHERE is_bot IS NOT NULL
                     AND created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                   GROUP BY DATE(created_at)""",
                (days - 1,),
            )
            by_day = {str(r["day"]): r for r in cur.fetchall()}

    today = date.today()
    trend = []
    for offset in range(days - 1, -1, -1):
        d = today - timedelta(days=offset)
        row = by_day.get(str(d))
        scored = int(row["scored_count"]) if row else 0
        bot_count = int(row["bot_count"] or 0) if row else 0
        rate = round(bot_count / scored * 100, 1) if scored else 0.0
        trend.append({"label": f"{d.month}/{d.day}", "value": rate})
    return {"trend": trend}


@router.get("/admin/dashboard/plan-usage")
def get_plan_usage_summary(admin: dict = Depends(get_current_admin)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT pl.plan_name AS plan, pl.api_limit AS limit_value,
                          COUNT(DISTINCT u.user_id) AS accounts,
                          COALESCE(SUM(uds.issued_count), 0) AS used
                   FROM plans pl
                   LEFT JOIN users u ON u.plan_id = pl.plan_id
                       AND u.role = 'user' AND u.user_status <> 'deleted'
                   LEFT JOIN usage_daily_stats uds ON uds.user_id = u.user_id
                       AND uds.usage_date >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
                   GROUP BY pl.plan_id, pl.plan_name, pl.api_limit
                   ORDER BY pl.plan_id"""
            )
            rows = cur.fetchall()

    return {
        "plans": [
            {
                "plan": r["plan"],
                "accounts": int(r["accounts"]),
                "used": int(r["used"]),
                "limit": int(r["limit_value"] or 0),
            }
            for r in rows
        ]
    }


@router.get("/admin/dashboard/plan-usage/{plan_name}")
def get_plan_usage_detail(plan_name: str, admin: dict = Depends(get_current_admin)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT u.user_id, u.user_name, u.company_name, u.email,
                          pl.plan_name AS plan, pl.api_limit,
                          ak.site_domain,
                          COALESCE(uds.monthly_calls, 0) AS monthly_calls,
                          COALESCE(cv.success_count, 0) AS success_count,
                          COALESCE(cv.fail_count, 0) AS fail_count,
                          COALESCE(cv.bot_count, 0) AS bot_count,
                          cv.last_called_at
                   FROM users u
                   JOIN plans pl ON pl.plan_id = u.plan_id
                   LEFT JOIN api_keys ak ON ak.api_key_id = (
                       SELECT inner_ak.api_key_id FROM api_keys inner_ak
                       WHERE inner_ak.user_id = u.user_id
                       ORDER BY inner_ak.api_key_id DESC LIMIT 1
                   )
                   LEFT JOIN (
                       SELECT user_id, SUM(issued_count) AS monthly_calls
                       FROM usage_daily_stats
                       WHERE usage_date >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
                       GROUP BY user_id
                   ) uds ON uds.user_id = u.user_id
                   LEFT JOIN (
                       SELECT ak2.user_id,
                              SUM(CASE WHEN cv2.verification_status = 'passed' THEN 1 ELSE 0 END) AS success_count,
                              SUM(CASE WHEN cv2.verification_status = 'failed' THEN 1 ELSE 0 END) AS fail_count,
                              SUM(CASE WHEN cv2.is_bot = 1 THEN 1 ELSE 0 END) AS bot_count,
                              MAX(cv2.created_at) AS last_called_at
                       FROM captcha_verifications cv2
                       JOIN api_keys ak2 ON ak2.api_key_id = cv2.api_key_id
                       WHERE cv2.created_at >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
                       GROUP BY ak2.user_id
                   ) cv ON cv.user_id = u.user_id
                   WHERE u.role = 'user' AND u.user_status <> 'deleted' AND pl.plan_name = %s
                   ORDER BY monthly_calls DESC""",
                (plan_name,),
            )
            rows = cur.fetchall()

    return {
        "rows": [
            {
                "id": r["user_id"],
                "plan": r["plan"],
                "userName": r["company_name"] or r["user_name"],
                "email": r["email"],
                "siteName": r["site_domain"] or "-",
                "monthlyCalls": int(r["monthly_calls"]),
                "monthlyLimit": int(r["api_limit"] or 0),
                "successCount": int(r["success_count"]),
                "failCount": int(r["fail_count"]),
                "botBlockedCount": int(r["bot_count"]),
                "lastCalledAt": r["last_called_at"].strftime("%Y-%m-%d") if r["last_called_at"] else "-",
            }
            for r in rows
        ]
    }


@router.get("/admin/dashboard/logs")
def get_recent_logs(
    limit: int = 20,
    offset: int = 0,
    search: str = "",
    admin: dict = Depends(get_current_admin),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    search = search.strip()

    where_clause = ""
    params = []
    if search:
        where_clause = """WHERE ak.site_domain LIKE %s
                           OR cv.captcha_type LIKE %s
                           OR cv.verification_status LIKE %s"""
        like = f"%{search}%"
        params = [like, like, like]

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""SELECT COUNT(*) AS total
                    FROM captcha_verifications cv
                    LEFT JOIN api_keys ak ON ak.api_key_id = cv.api_key_id
                    {where_clause}""",
                params,
            )
            total = int(cur.fetchone()["total"])

            cur.execute(
                f"""SELECT cv.created_at, ak.site_domain, cv.captcha_type,
                           cv.response_time_ms, cv.bot_score, cv.is_correct,
                           cv.is_bot, cv.model_version, cv.verification_status,
                           cv.failure_reason
                    FROM captcha_verifications cv
                    LEFT JOIN api_keys ak ON ak.api_key_id = cv.api_key_id
                    {where_clause}
                    ORDER BY cv.created_at DESC
                    LIMIT %s OFFSET %s""",
                params + [limit, offset],
            )
            rows = cur.fetchall()

    logs = []
    for r in rows:
        bot_score_100 = (
            round(float(r["bot_score"]) * 100)
            if r["bot_score"] is not None
            else None
        )
        result = {
            "passed": "성공",
            "pending": "의심",
        }.get(r["verification_status"], "실패")
        duration = f'{(r["response_time_ms"] or 0) / 1000:.1f}초' if r["response_time_ms"] is not None else "-"
        logs.append({
            "time": format_seoul_datetime(r["created_at"]),
            "site": r["site_domain"] or "-",
            "captchaType": r["captcha_type"],
            "duration": duration,
            "botScore": bot_score_100,
            "answerCorrect": bool(r["is_correct"]),
            "isBot": bool(r["is_bot"]) if r["is_bot"] is not None else None,
            "modelVersion": r["model_version"],
            "result": result,
            "failureReason": r["failure_reason"],
        })
    return {"logs": logs, "total": total}


@router.get("/admin/sites")
def list_sites(admin: dict = Depends(get_current_admin)):
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT ak.api_key_id, ak.site_domain, ak.created_at, ak.is_active,
                          u.user_name, u.company_name,
                          pl.plan_name, pl.api_limit,
                          COALESCE(uds.monthly_usage, 0) AS monthly_usage
                   FROM api_keys ak
                   JOIN users u ON u.user_id = ak.user_id
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   LEFT JOIN (
                       SELECT user_id, SUM(issued_count) AS monthly_usage
                       FROM usage_daily_stats
                       WHERE usage_date >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
                       GROUP BY user_id
                   ) uds ON uds.user_id = ak.user_id
                   WHERE ak.expired_at IS NULL OR ak.expired_at > NOW()
                   ORDER BY ak.created_at DESC"""
            )
            rows = cur.fetchall()

    return {
        "sites": [
            {
                "apiKeyId": r["api_key_id"],
                "name": r["company_name"] or r["user_name"],
                "domain": r["site_domain"] or "-",
                "owner": r["company_name"] or r["user_name"],
                "plan": r["plan_name"] or "-",
                "monthlyLimit": int(r["api_limit"] or 0),
                "monthlyUsage": int(r["monthly_usage"]),
                "status": "활성" if r["is_active"] else "비활성",
                "createdAt": r["created_at"].strftime("%Y-%m-%d") if r["created_at"] else "-",
            }
            for r in rows
        ]
    }


class UpdateSiteStatusRequest(BaseModel):
    status: str  # '활성' | '비활성'


SITE_STATUS_LABEL_TO_ACTIVE = {"활성": True, "비활성": False}


@router.patch("/admin/sites/{api_key_id}/status")
def update_site_status(
    api_key_id: int,
    body: UpdateSiteStatusRequest,
    admin: dict = Depends(get_current_admin),
):
    """'사이트' = api_keys 행이므로, 이 토글은 사용자 관리의 API Key 상태 토글과 동일한
    자원(api_keys.is_active)을 공유한다 — 실체가 하나이므로 의도된 동작이다."""
    if body.status not in SITE_STATUS_LABEL_TO_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="status는 '활성' 또는 '비활성'만 가능합니다.",
        )
    make_active = SITE_STATUS_LABEL_TO_ACTIVE[body.status]

    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT api_key_id FROM api_keys WHERE api_key_id = %s FOR UPDATE",
                (api_key_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="사이트(API Key)를 찾을 수 없습니다.")

            if make_active:
                cur.execute(
                    "UPDATE api_keys SET is_active = TRUE, expired_at = NULL WHERE api_key_id = %s",
                    (api_key_id,),
                )
            else:
                cur.execute(
                    "UPDATE api_keys SET is_active = FALSE, expired_at = NOW() WHERE api_key_id = %s",
                    (api_key_id,),
                )
        conn.commit()

    return {"api_key_id": api_key_id, "status": body.status}
