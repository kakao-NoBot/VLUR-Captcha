"""챗봇의 외부 AI 호출을 보호하기 위한 인메모리 요청 제한기."""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict, deque
from math import ceil


MINUTE_WINDOW_SECONDS = 60
DAY_WINDOW_SECONDS = 24 * 60 * 60


def _positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


CHATBOT_REQUESTS_PER_MINUTE = _positive_int_env("CHATBOT_REQUESTS_PER_MINUTE", 10)
CHATBOT_REQUESTS_PER_DAY = _positive_int_env("CHATBOT_REQUESTS_PER_DAY", 100)

_requests_by_ip: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def consume_request(client_ip: str) -> int | None:
    """요청을 기록하고, 제한 초과 시 다시 시도할 수 있는 초 단위를 반환한다."""
    now = time.monotonic()

    with _lock:
        requests = _requests_by_ip[client_ip]
        cutoff = now - DAY_WINDOW_SECONDS
        while requests and requests[0] <= cutoff:
            requests.popleft()

        minute_cutoff = now - MINUTE_WINDOW_SECONDS
        minute_requests = [requested_at for requested_at in requests if requested_at > minute_cutoff]
        if len(minute_requests) >= CHATBOT_REQUESTS_PER_MINUTE:
            return max(1, ceil(minute_requests[0] + MINUTE_WINDOW_SECONDS - now))

        if len(requests) >= CHATBOT_REQUESTS_PER_DAY:
            return max(1, ceil(requests[0] + DAY_WINDOW_SECONDS - now))

        requests.append(now)
        return None
