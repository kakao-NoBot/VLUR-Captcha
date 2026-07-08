from fastapi import APIRouter, Depends, HTTPException, status

from auth.deps import get_current_user
from db import get_conn


router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/summary")
def get_usage_summary(current_user: dict = Depends(get_current_user)):
    """로그인 사용자의 일별·월별 사용량과 이번 달 CAPTCHA 발급 합계를 반환한다."""
    user_id = current_user["sub"]
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT pl.plan_name, COALESCE(pl.api_limit, 0) AS api_limit
                   FROM users u
                   LEFT JOIN plans pl ON pl.plan_id = u.plan_id
                   WHERE u.user_id = %s""",
                (user_id,),
            )
            plan = cur.fetchone()

            if not plan:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="사용자를 찾을 수 없습니다.",
                )

            cur.execute(
                """SELECT DATE_FORMAT(usage_date, '%%Y-%%m-%%d') AS date,
                          issued_count AS issued,
                          verified_count AS verified
                   FROM usage_daily_stats
                   WHERE user_id = %s
                     AND usage_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%%Y-%%m-01')
                     AND usage_date < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
                   ORDER BY usage_date""",
                (user_id,),
            )
            daily = cur.fetchall()

            cur.execute(
                """SELECT DATE_FORMAT(usage_date, '%%Y-%%m') AS month,
                          SUM(issued_count) AS issued
                   FROM usage_daily_stats
                   WHERE user_id = %s
                     AND usage_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%%Y-%%m-01')
                     AND usage_date < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)
                   GROUP BY DATE_FORMAT(usage_date, '%%Y-%%m')
                   ORDER BY month""",
                (user_id,),
            )
            monthly = cur.fetchall()

            cur.execute(
                """SELECT COALESCE(SUM(issued_count), 0) AS issued_total
                   FROM usage_daily_stats
                   WHERE user_id = %s
                     AND usage_date >= DATE_FORMAT(CURDATE(), '%%Y-%%m-01')
                     AND usage_date < DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)""",
                (user_id,),
            )
            current_month = cur.fetchone()

    return {
        "plan_name": plan["plan_name"],
        "api_limit": int(plan["api_limit"] or 0),
        "current_month_issued": int(current_month["issued_total"] or 0),
        "daily": [
            {
                "date": row["date"],
                "issued": int(row["issued"] or 0),
                "verified": int(row["verified"] or 0),
            }
            for row in daily
        ],
        "monthly": [
            {"month": row["month"], "issued": int(row["issued"] or 0)}
            for row in monthly
        ],
    }
