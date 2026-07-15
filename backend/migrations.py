"""서버 시작 시 실행되는 경량 스키마 마이그레이션.

database/init/*.sql은 MySQL 볼륨이 비어 있을 때만 1회 실행되므로,
이미 데이터가 있는 DB(팀원 로컬 환경 등)에는 이후의 스키마 변경이 반영되지 않는다.
여기서 시작 시마다 검사해 누락된 변경만 적용한다. 모든 단계는 멱등이어야 한다.
"""
from datetime import date, timedelta

from db import get_conn

BOARD_TYPE_ENUM = "ENUM('notice','qna','inquiry','general','faq','research')"
PLAN_LIMITS = {
    "Basic": (100000, 100000),
    "Pro": (500000, 500000),
}

def _first_day_months_ago(target: date, months: int) -> date:
    """target 기준 `months`개월 전 달의 1일을 반환한다."""
    year = target.year
    month = target.month - months
    while month <= 0:
        year -= 1
        month += 12
    return date(year, month, 1)


def _build_testuser_usage_seed(today: date | None = None) -> tuple[tuple[str, str, int, int], ...]:
    """사용량 화면 확인용 testuser의 최근 12개월 일별 더미 데이터를 만든다."""
    today = today or date.today()
    start_date = _first_day_months_ago(today, 11)
    total_days = (today - start_date).days + 1
    rows = []

    for index in range(total_days):
        usage_date = start_date + timedelta(days=index)
        issued = 900 + ((index * 173) % 1000) + ((usage_date.day % 5) * 55)
        if usage_date.weekday() >= 5:
            issued = max(700, round(issued * 0.72))
        verified = issued - (12 + (index % 36))
        rows.append(("testuser", usage_date.isoformat(), issued, verified))

    return tuple(rows)


def _build_testuser_payment_seed(today: date | None = None) -> tuple[tuple[str, str, int, str, str, str, str], ...]:
    """결제 내역 화면 확인용 testuser의 최근 20개월 더미 데이터를 만든다."""
    today = today or date.today()
    rows = []

    for index in range(20):
        payment_month = _first_day_months_ago(today, 19 - index)
        paid_day = min(5, today.day) if payment_month == today.replace(day=1) else 5
        paid_at = payment_month.replace(day=paid_day).isoformat() + " 10:00:00"
        provider = "toss" if index % 2 == 0 else "kakao"
        payment_key = f"seed-payment-{payment_month.strftime('%Y%m')}"
        rows.append((
            "testuser",
            "Pro",
            89000,
            provider,
            f"seed-order-{payment_month.strftime('%Y%m')}",
            payment_key,
            paid_at,
        ))

    return tuple(rows)


def _table_exists(cur, table: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s""",
        (table,),
    )
    return cur.fetchone() is not None


def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        """SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s""",
        (table, column),
    )
    return cur.fetchone() is not None


def _column_type(cur, table: str, column: str) -> str:
    cur.execute(
        """SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s""",
        (table, column),
    )
    row = cur.fetchone()
    return (row["column_type"] if row else "") or ""


def run_migrations() -> None:
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            # 0) 기존 볼륨의 요금제 한도 보정
            plan_limit_updates = [
                (api_limit, captcha_limit, plan_name, api_limit, captcha_limit)
                for plan_name, (api_limit, captcha_limit) in PLAN_LIMITS.items()
            ]
            cur.executemany(
                """UPDATE plans
                   SET api_limit = %s, captcha_limit = %s
                   WHERE plan_name = %s
                     AND (api_limit <> %s OR captcha_limit <> %s)""",
                plan_limit_updates,
            )
            if cur.rowcount:
                print("[migrate] Basic/Pro 요금제 한도 보정")

            # 1) boards.view_count — 게시글 조회수
            if not _column_exists(cur, "boards", "view_count"):
                cur.execute(
                    "ALTER TABLE boards ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER board_type"
                )
                print("[migrate] boards.view_count 컬럼 추가")

            # 2) boards.board_type — general/faq/research 유형 지원
            board_type = _column_type(cur, "boards", "board_type")
            if any(f"'{v}'" not in board_type for v in ("general", "faq", "research")):
                cur.execute(f"ALTER TABLE boards MODIFY board_type {BOARD_TYPE_ENUM} NOT NULL")
                print("[migrate] boards.board_type ENUM 확장 (general/faq/research)")

            # 3) users.api_key_suspended — 관리자의 API Key 사용 제재 플래그
            if not _column_exists(cur, "users", "api_key_suspended"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN api_key_suspended BOOLEAN NOT NULL DEFAULT FALSE AFTER user_status"
                )
                print("[migrate] users.api_key_suspended 컬럼 추가")

            # 4) users 예약 요금제 변경/해지 컬럼
            if not _column_exists(cur, "users", "pending_plan_id"):
                cur.execute(
                    """ALTER TABLE users
                       ADD COLUMN pending_plan_id BIGINT UNSIGNED NULL AFTER plan_id,
                       ADD KEY idx_users_pending_plan_id (pending_plan_id),
                       ADD CONSTRAINT fk_users_pending_plan
                           FOREIGN KEY (pending_plan_id) REFERENCES plans (plan_id)
                           ON DELETE SET NULL ON UPDATE CASCADE"""
                )
                print("[migrate] users.pending_plan_id 컬럼 추가")

            if not _column_exists(cur, "users", "plan_change_at"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN plan_change_at DATETIME NULL AFTER pending_plan_id"
                )
                print("[migrate] users.plan_change_at 컬럼 추가")

            if not _column_exists(cur, "users", "cancel_at"):
                cur.execute(
                    "ALTER TABLE users ADD COLUMN cancel_at DATETIME NULL AFTER plan_change_at"
                )
                print("[migrate] users.cancel_at 컬럼 추가")

            # 5) usage_daily_stats — 사용자별 일일 CAPTCHA 발급/검증 집계
            if not _table_exists(cur, "usage_daily_stats"):
                cur.execute(
                    """CREATE TABLE usage_daily_stats (
                           user_id        VARCHAR(50)  NOT NULL,
                           usage_date     DATE         NOT NULL,
                           issued_count   INT UNSIGNED NOT NULL DEFAULT 0,
                           verified_count INT UNSIGNED NOT NULL DEFAULT 0,
                           created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                           updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                           PRIMARY KEY (user_id, usage_date),
                           KEY idx_usage_daily_stats_date (usage_date),
                           CONSTRAINT fk_usage_daily_stats_user
                               FOREIGN KEY (user_id) REFERENCES users (user_id)
                               ON DELETE CASCADE ON UPDATE RESTRICT,
                           CONSTRAINT chk_usage_daily_stats_verified
                               CHECK (verified_count <= issued_count)
                       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""
                )
                print("[migrate] usage_daily_stats 테이블 추가")

            # 6) 사용량 화면 확인용 testuser 더미 데이터.
            # 이미 기록된 날짜는 보존해 실제 사용량을 덮어쓰지 않는다.
            cur.executemany(
                """INSERT IGNORE INTO usage_daily_stats
                       (user_id, usage_date, issued_count, verified_count)
                   SELECT %s, %s, %s, %s
                   WHERE EXISTS (SELECT 1 FROM users WHERE user_id = %s)""",
                [(*row, row[0]) for row in _build_testuser_usage_seed()],
            )
            if cur.rowcount:
                print("[migrate] testuser 사용량 더미 데이터 추가")

            # 7) 결제 내역 화면 확인용 testuser 더미 데이터.
            # pg_payment_key의 고유 제약을 이용해 기존 결제 이력은 보존한다.
            cur.executemany(
                """INSERT IGNORE INTO payments
                       (user_id, plan_id, amount, pg_provider, pg_provider_id,
                        pg_payment_key, payment_status, paid_at)
                   SELECT %s, plan_id, %s, %s, %s, %s, 'paid', %s
                   FROM plans
                   WHERE plan_name = %s
                     AND EXISTS (SELECT 1 FROM users WHERE user_id = %s)""",
                [
                    (*row[:1], row[2], row[3], row[4], row[5], row[6], row[1], row[0])
                    for row in _build_testuser_payment_seed()
                ],
            )
            if cur.rowcount:
                print("[migrate] testuser 결제 더미 데이터 추가")
        conn.commit()
