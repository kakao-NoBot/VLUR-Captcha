# site_key.py
# 공개 CAPTCHA API(challenge/verify)용 인증 — JWT가 아니라 브라우저에 노출해도 되는
# Site Key(pk-...) + 발급 시 등록한 site_domain으로 요청 출처를 검증한다.
# (reCAPTCHA/hCaptcha와 동일한 "공개 site key + 도메인 락" 모델)

from urllib.parse import urlsplit

from fastapi import Header, HTTPException, Request, status

from db import get_conn
from services.captcha_theme import DEFAULT_CAPTCHA_THEME


def _request_hostname(request: Request) -> str | None:
    """Origin 헤더를 우선 사용하고, 없으면 Referer로 폴백해 호스트명만 추출한다."""
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin:
        return None
    hostname = urlsplit(origin).hostname
    return hostname.lower() if hostname else None


def get_site_key_context(
    request: Request,
    x_site_key: str = Header(..., alias="X-Site-Key"),
) -> dict:
    """Site Key + Origin/Referer 도메인을 검증하고 {api_key_id, user_id}를 반환한다."""
    conn = get_conn()
    with conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT api_key_id, user_id, site_domain, captcha_theme
                   FROM api_keys
                   WHERE site_key = %s
                     AND is_active = TRUE
                     AND (expired_at IS NULL OR expired_at > NOW())""",
                (x_site_key,),
            )
            key_row = cur.fetchone()

    if not key_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 비활성화된 Site Key입니다.",
        )

    if not key_row["site_domain"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 Site Key에는 허용 도메인이 등록되어 있지 않습니다.",
        )

    hostname = _request_hostname(request)
    if not hostname or hostname != key_row["site_domain"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="이 요청 출처는 Site Key에 등록된 도메인과 일치하지 않습니다.",
        )

    return {
        "api_key_id": key_row["api_key_id"],
        "user_id": key_row["user_id"],
        "captcha_theme": key_row["captcha_theme"] or DEFAULT_CAPTCHA_THEME,
    }
