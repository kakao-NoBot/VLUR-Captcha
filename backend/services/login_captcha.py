"""로그인 연속 실패 시에만 사용하는 단기 CAPTCHA 상태 관리.

문제·정답·통과 토큰은 서버 메모리에만 보관하며, 통과 토큰은 같은 IP/아이디에서
한 번의 로그인 요청에만 사용할 수 있다. 단일 백엔드 컨테이너 기준 구현이다.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import hashlib
import secrets
import threading
import time

from fastapi import Request


MAX_LOGIN_FAILURES = 5
FAILURE_WINDOW_SECONDS = 15 * 60
CHALLENGE_TTL_SECONDS = 5 * 60
SOLVED_TOKEN_TTL_SECONDS = 5 * 60
MAX_CHALLENGE_ATTEMPTS = 3

# question_asset은 프론트엔드가 문제 이미지를 고르는 불투명 식별자이며, 정답은 응답에 포함하지 않는다.
QUESTION_SETS = (
    ("type1_drag", "q1", "banana", ("banana", "carrot", "cherry", "broccoli")),
    ("type1_drag", "q2", "bear", ("cat", "dog", "bear", "chicken")),
    ("type1_drag", "q3", "airplane", ("airplane", "car", "bicycle", "apple")),
    ("type2_identify", "q1", "banana", ("banana", "carrot", "cherry", "broccoli")),
    ("type2_identify", "q2", "bear", ("cat", "dog", "bear", "chicken")),
    ("type2_identify", "q3", "airplane", ("airplane", "car", "bicycle", "apple")),
)


@dataclass
class _Challenge:
    identity: str
    answer: str
    expires_at: float
    attempts: int = 0


@dataclass
class _SolvedToken:
    identity: str
    expires_at: float


_lock = threading.Lock()
_failed_attempts: dict[str, deque[float]] = {}
_challenges: dict[str, _Challenge] = {}
_solved_tokens: dict[str, _SolvedToken] = {}


def _identity(request: Request, user_id: str) -> str:
    client_ip = request.client.host if request.client else "unknown"
    source = f"{client_ip}:{user_id.strip().lower()}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _purge_expired(now: float) -> None:
    for key, attempts in list(_failed_attempts.items()):
        while attempts and attempts[0] <= now - FAILURE_WINDOW_SECONDS:
            attempts.popleft()
        if not attempts:
            del _failed_attempts[key]
    for challenge_id, challenge in list(_challenges.items()):
        if challenge.expires_at <= now or challenge.attempts >= MAX_CHALLENGE_ATTEMPTS:
            del _challenges[challenge_id]
    for token, solved in list(_solved_tokens.items()):
        if solved.expires_at <= now:
            del _solved_tokens[token]


def _captcha_payload(challenge_id: str, captcha_type: str, question_asset: str, options: tuple[str, ...]) -> dict:
    shuffled = list(options)
    secrets.SystemRandom().shuffle(shuffled)
    return {
        "challenge_id": challenge_id,
        "captcha_type": captcha_type,
        "question_asset": question_asset,
        "options": shuffled,
        "expires_in": CHALLENGE_TTL_SECONDS,
    }


def is_captcha_required(request: Request, user_id: str) -> bool:
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        return len(_failed_attempts.get(_identity(request, user_id), ())) >= MAX_LOGIN_FAILURES


def record_login_failure(request: Request, user_id: str) -> bool:
    """실패를 기록하고 이번 실패로 CAPTCHA가 필요한 상태가 됐는지 반환한다."""
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        identity = _identity(request, user_id)
        attempts = _failed_attempts.setdefault(identity, deque())
        attempts.append(now)
        return len(attempts) >= MAX_LOGIN_FAILURES


def clear_login_failures(request: Request, user_id: str) -> None:
    with _lock:
        _failed_attempts.pop(_identity(request, user_id), None)


def issue_challenge(request: Request, user_id: str) -> dict | None:
    """현재 CAPTCHA가 요구될 때만 새 문제를 발급한다."""
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        identity = _identity(request, user_id)
        if len(_failed_attempts.get(identity, ())) < MAX_LOGIN_FAILURES:
            return None

        captcha_type, question_asset, answer, options = secrets.choice(QUESTION_SETS)
        challenge_id = secrets.token_urlsafe(32)
        _challenges[challenge_id] = _Challenge(
            identity=identity,
            answer=answer,
            expires_at=now + CHALLENGE_TTL_SECONDS,
        )
        return _captcha_payload(challenge_id, captcha_type, question_asset, options)


def verify_challenge_for_user(request: Request, user_id: str, challenge_id: str, answer: str) -> str | None:
    """challenge가 요청 IP/아이디와 일치하고 정답일 때만 통과 토큰을 발급한다."""
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        challenge = _challenges.get(challenge_id)
        if not challenge or challenge.identity != _identity(request, user_id):
            return None

        challenge.attempts += 1
        if not secrets.compare_digest(challenge.answer, answer.strip().lower()):
            if challenge.attempts >= MAX_CHALLENGE_ATTEMPTS:
                del _challenges[challenge_id]
            return None

        del _challenges[challenge_id]
        token = secrets.token_urlsafe(32)
        _solved_tokens[token] = _SolvedToken(
            identity=challenge.identity,
            expires_at=now + SOLVED_TOKEN_TTL_SECONDS,
        )
        return token


def consume_solved_token(request: Request, user_id: str, token: str | None) -> bool:
    """CAPTCHA가 필요한 상태라면 유효한 토큰을 1회 소비해 로그인 시도를 허용한다."""
    now = time.monotonic()
    with _lock:
        _purge_expired(now)
        identity = _identity(request, user_id)
        if len(_failed_attempts.get(identity, ())) < MAX_LOGIN_FAILURES:
            return True
        if not token:
            return False

        solved = _solved_tokens.get(token)
        if not solved or solved.identity != identity:
            return False

        del _solved_tokens[token]
        # 통과한 사람에게는 한 번의 새 로그인 시도를 부여한다.
        _failed_attempts.pop(identity, None)
        return True
