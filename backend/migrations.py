"""서버 시작 시 실행되는 경량 스키마 마이그레이션.

database/init/*.sql은 MySQL 볼륨이 비어 있을 때만 1회 실행되므로,
이미 데이터가 있는 DB(팀원 로컬 환경 등)에는 이후의 스키마 변경이 반영되지 않는다.
여기서 시작 시마다 검사해 누락된 변경만 적용한다. 모든 단계는 멱등이어야 한다.
"""
from db import get_conn

BOARD_TYPE_ENUM = "ENUM('notice','qna','inquiry','general','faq','research')"

JULY_USAGE_SEED = (
    ("testuser", "2026-07-01", 820, 786),
    ("testuser", "2026-07-02", 1100, 1063),
    ("testuser", "2026-07-03", 950, 920),
    ("testuser", "2026-07-04", 1240, 1203),
    ("testuser", "2026-07-05", 1380, 1341),
    ("testuser", "2026-07-06", 990, 954),
    ("testuser", "2026-07-07", 670, 649),
    ("testuser", "2026-07-08", 1050, 1017),
)


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
                cur.executemany(
                    """INSERT INTO usage_daily_stats
                           (user_id, usage_date, issued_count, verified_count)
                       SELECT %s, %s, %s, %s
                       WHERE EXISTS (SELECT 1 FROM users WHERE user_id = %s)""",
                    [(*row, row[0]) for row in JULY_USAGE_SEED],
                )
                print("[migrate] usage_daily_stats 테이블 및 2026년 7월 시드 추가")
        conn.commit()
