"""이메일 인증번호 발급/검증 상태 관리 (메모리 저장)

단일 백엔드 컨테이너 기준이라 인메모리 dict로 충분.
서버 재시작 시 진행 중이던 인증만 초기화된다.
"""
import secrets
import threading
import time

CODE_TTL = 180          # 인증번호 유효 시간 3분 (프론트 타이머와 동일)
VERIFIED_TTL = 1800     # 인증 완료 상태 유지 30분 (이 안에 가입 완료해야 함)
RESEND_COOLDOWN = 30    # 재전송 대기 30초
MAX_ATTEMPTS = 5        # 인증번호 입력 시도 제한

_lock = threading.Lock()
_codes: dict[str, dict] = {}     # email -> {code, expires_at, sent_at, attempts}
_verified: dict[str, float] = {} # email -> verified_until


def _normalize(email: str) -> str:
    return email.strip().lower()


def issue_code(email: str) -> str:
    """새 인증번호 발급. 재전송 쿨다운이면 RuntimeError."""
    email = _normalize(email)
    now = time.time()
    with _lock:
        entry = _codes.get(email)
        if entry and now - entry["sent_at"] < RESEND_COOLDOWN:
            wait = int(RESEND_COOLDOWN - (now - entry["sent_at"]))
            raise RuntimeError(f"{wait}초 후에 다시 요청해 주세요.")
        code = f"{secrets.randbelow(1_000_000):06d}"
        _codes[email] = {"code": code, "expires_at": now + CODE_TTL, "sent_at": now, "attempts": 0}
        _verified.pop(email, None)
    return code


def discard_code(email: str) -> None:
    """메일 발송 실패 시 발급 취소 (재전송 쿨다운 해제)"""
    with _lock:
        _codes.pop(_normalize(email), None)


def verify_code(email: str, code: str) -> tuple[bool, str]:
    """(성공 여부, 실패 사유) 반환. 성공 시 인증 완료 상태로 전환."""
    email = _normalize(email)
    now = time.time()
    with _lock:
        entry = _codes.get(email)
        if not entry:
            return False, "인증번호를 먼저 요청해 주세요."
        if now > entry["expires_at"]:
            del _codes[email]
            return False, "인증번호가 만료되었습니다. 다시 요청해 주세요."
        if entry["attempts"] >= MAX_ATTEMPTS:
            del _codes[email]
            return False, "시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요."
        entry["attempts"] += 1
        if not secrets.compare_digest(entry["code"], code.strip()):
            return False, "인증번호가 일치하지 않습니다."
        del _codes[email]
        _verified[email] = now + VERIFIED_TTL
    return True, ""


def is_verified(email: str) -> bool:
    email = _normalize(email)
    with _lock:
        until = _verified.get(email)
        if until is None:
            return False
        if time.time() > until:
            del _verified[email]
            return False
    return True


def consume_verified(email: str) -> None:
    """가입 완료 후 인증 상태 소거 (재사용 방지)"""
    with _lock:
        _verified.pop(_normalize(email), None)
