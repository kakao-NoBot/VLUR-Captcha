"""DB에서 읽은 UTC datetime을 화면 표시용 시간대로 변환한다."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SEOUL_TZ = ZoneInfo("Asia/Seoul")


def format_seoul_datetime(value: datetime | None) -> str:
    """PyMySQL의 naive UTC datetime을 서울 시간의 분 단위 문자열로 반환한다."""
    if value is None:
        return "-"
    utc_value = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return utc_value.astimezone(SEOUL_TZ).strftime("%Y-%m-%d %H:%M")
