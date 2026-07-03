import os
from urllib.parse import urlencode

import httpx


KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize"
KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token"
KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me"


class KakaoConfigurationError(RuntimeError):
    pass


class KakaoOAuthError(RuntimeError):
    pass


def _settings():
    rest_api_key = os.getenv("KAKAO_REST_API_KEY", "").strip()
    redirect_uri = os.getenv("KAKAO_REDIRECT_URI", "").strip()
    client_secret = os.getenv("KAKAO_CLIENT_SECRET", "").strip()

    if not rest_api_key or not redirect_uri:
        raise KakaoConfigurationError(
            "KAKAO_REST_API_KEY와 KAKAO_REDIRECT_URI를 설정해 주세요."
        )
    return rest_api_key, redirect_uri, client_secret


def build_authorize_url(state: str) -> str:
    rest_api_key, redirect_uri, _ = _settings()
    query = urlencode({
        "client_id": rest_api_key,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    })
    return f"{KAKAO_AUTHORIZE_URL}?{query}"


async def fetch_kakao_user(code: str) -> dict:
    rest_api_key, redirect_uri, client_secret = _settings()
    token_payload = {
        "grant_type": "authorization_code",
        "client_id": rest_api_key,
        "redirect_uri": redirect_uri,
        "code": code,
    }
    if client_secret:
        token_payload["client_secret"] = client_secret

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(KAKAO_TOKEN_URL, data=token_payload)
            if token_response.is_error:
                raise KakaoOAuthError("카카오 인증 코드를 확인하지 못했습니다.")

            access_token = token_response.json().get("access_token")
            if not access_token:
                raise KakaoOAuthError("카카오 액세스 토큰이 응답에 없습니다.")

            user_response = await client.get(
                KAKAO_USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if user_response.is_error:
                raise KakaoOAuthError("카카오 사용자 정보를 가져오지 못했습니다.")
    except httpx.RequestError as exc:
        raise KakaoOAuthError("카카오 인증 서버에 연결할 수 없습니다.") from exc

    kakao_user = user_response.json()
    account = kakao_user.get("kakao_account") or {}
    profile = account.get("profile") or {}
    properties = kakao_user.get("properties") or {}

    return {
        "provider_user_id": str(kakao_user.get("id") or ""),
        "email": account.get("email"),
        "nickname": profile.get("nickname") or properties.get("nickname"),
    }
