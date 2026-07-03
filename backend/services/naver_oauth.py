import os
from urllib.parse import urlencode

import httpx


NAVER_AUTHORIZE_URL = "https://nid.naver.com/oauth2.0/authorize"
NAVER_TOKEN_URL = "https://nid.naver.com/oauth2.0/token"
NAVER_USER_INFO_URL = "https://openapi.naver.com/v1/nid/me"


class NaverConfigurationError(RuntimeError):
    pass


class NaverOAuthError(RuntimeError):
    pass


def _settings():
    client_id = os.getenv("NAVER_CLIENT_ID", "").strip()
    client_secret = os.getenv("NAVER_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("NAVER_REDIRECT_URI", "").strip()

    if not client_id or not client_secret or not redirect_uri:
        raise NaverConfigurationError(
            "NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, NAVER_REDIRECT_URI를 설정해 주세요."
        )
    return client_id, client_secret, redirect_uri


def build_naver_authorize_url(state: str) -> str:
    client_id, _, redirect_uri = _settings()
    query = urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    })
    return f"{NAVER_AUTHORIZE_URL}?{query}"


async def fetch_naver_user(code: str, state: str) -> dict:
    client_id, client_secret, _ = _settings()
    token_params = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "state": state,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.get(NAVER_TOKEN_URL, params=token_params)
            token_data = token_response.json()
            if token_response.is_error or token_data.get("error"):
                raise NaverOAuthError("네이버 인증 코드를 확인하지 못했습니다.")

            access_token = token_data.get("access_token")
            if not access_token:
                raise NaverOAuthError("네이버 액세스 토큰이 응답에 없습니다.")

            user_response = await client.get(
                NAVER_USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_data = user_response.json()
            if user_response.is_error or user_data.get("resultcode") != "00":
                raise NaverOAuthError("네이버 사용자 정보를 가져오지 못했습니다.")
    except httpx.RequestError as exc:
        raise NaverOAuthError("네이버 인증 서버에 연결할 수 없습니다.") from exc
    except ValueError as exc:
        raise NaverOAuthError("네이버 인증 서버의 응답을 해석하지 못했습니다.") from exc

    profile = user_data.get("response") or {}
    return {
        "provider_user_id": str(profile.get("id") or ""),
        "email": profile.get("email"),
        "user_name": profile.get("name"),
    }
