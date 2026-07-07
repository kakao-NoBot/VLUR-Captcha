"""서버 시작 시 실행되는 경량 스키마 마이그레이션.

database/init/*.sql은 MySQL 볼륨이 비어 있을 때만 1회 실행되므로,
이미 데이터가 있는 DB(팀원 로컬 환경 등)에는 이후의 스키마 변경이 반영되지 않는다.
여기서 시작 시마다 검사해 누락된 변경만 적용한다. 모든 단계는 멱등이어야 한다.
"""
from db import get_conn

BOARD_TYPE_ENUM = "ENUM('notice','qna','inquiry','general','faq','research')"


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
        conn.commit()
