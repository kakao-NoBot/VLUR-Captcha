import os
import logging
import time

import pymysql
from pymysql.err import OperationalError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


def get_conn():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "db"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=_positive_int_env("DB_CONNECT_TIMEOUT_SECONDS", 5),
    )


def wait_for_database() -> None:
    """MySQL이 SQL 연결을 받을 때까지 시작 단계에서 대기한다.

    Docker의 healthcheck는 컨테이너 간 시작 순서를 돕지만, MySQL 초기화가
    끝나는 순간과 애플리케이션의 실제 SQL 연결 시점 사이에는 짧은 간격이
    생길 수 있다. 이 재시도로 백엔드 재시작·긴 traceback 반복을 방지한다.
    """
    attempts = _positive_int_env("DB_STARTUP_RETRY_ATTEMPTS", 30)
    retry_seconds = _positive_int_env("DB_STARTUP_RETRY_INTERVAL_SECONDS", 2)
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            conn = get_conn()
            conn.close()
            if attempt > 1:
                logger.info("Database connection is ready after %s attempts.", attempt)
            return
        except (OperationalError, OSError) as exc:
            last_error = exc
            if attempt == attempts:
                break
            if attempt == 1 or attempt % 5 == 0:
                logger.info(
                    "Database is not ready yet; retrying connection (%s/%s).",
                    attempt,
                    attempts,
                )
            time.sleep(retry_seconds)

    raise RuntimeError(
        f"Database connection was not ready after {attempts * retry_seconds} seconds."
    ) from last_error
