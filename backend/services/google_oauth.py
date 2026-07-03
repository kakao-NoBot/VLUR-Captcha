import os
from urllib.parse import urlencode

import httpx


GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_INFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class GoogleConfigurationError(RuntimeError):
    pass


class GoogleOAuthError(RuntimeError):
    pass


def _settings():
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "").strip()

    if not client_id or not client_secret or not redirect_uri:
        raise GoogleConfigurationError(
            "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI를 설정해 주세요."
        )
    return client_id, client_secret, redirect_uri


def build_google_authorize_url(state: str) -> str:
    client_id, _, redirect_uri = _settings()
    query = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    })
    return f"{GOOGLE_AUTHORIZE_URL}?{query}"


async def fetch_google_user(code: str) -> dict:
    client_id, client_secret, redirect_uri = _settings()
    token_payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(GOOGLE_TOKEN_URL, data=token_payload)
            token_data = token_response.json()
            if token_response.is_error or token_data.get("error"):
                raise GoogleOAuthError("구글 인증 코드를 확인하지 못했습니다.")

            access_token = token_data.get("access_token")
            if not access_token:
                raise GoogleOAuthError("구글 액세스 토큰이 응답에 없습니다.")

            user_response = await client.get(
                GOOGLE_USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_data = user_response.json()
            if user_response.is_error or user_data.get("error"):
                raise GoogleOAuthError("구글 사용자 정보를 가져오지 못했습니다.")
    except httpx.RequestError as exc:
        raise GoogleOAuthError("구글 인증 서버에 연결할 수 없습니다.") from exc
    except ValueError as exc:
        raise GoogleOAuthError("구글 인증 서버의 응답을 해석하지 못했습니다.") from exc

    return {
        "provider_user_id": str(user_data.get("sub") or ""),
        "email": user_data.get("email"),
        "email_verified": user_data.get("email_verified") is True,
        "user_name": user_data.get("name"),
    }
