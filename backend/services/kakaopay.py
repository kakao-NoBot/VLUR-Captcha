import os

import httpx


KAKAOPAY_BASE_URL = "https://open-api.kakaopay.com/online/v1/payment"


class KakaoPayConfigurationError(RuntimeError):
    pass


class KakaoPayAPIError(RuntimeError):
    pass


def _settings():
    secret_key = os.getenv("KAKAOPAY_SECRET_KEY", "").strip()
    cid = os.getenv("KAKAOPAY_CID", "TC0ONETIME").strip()
    cid_secret = os.getenv("KAKAOPAY_CID_SECRET", "").strip()
    if not secret_key:
        raise KakaoPayConfigurationError("KAKAOPAY_SECRET_KEY를 설정해 주세요.")
    return secret_key, cid, cid_secret


async def _post(path: str, payload: dict) -> dict:
    secret_key, _, _ = _settings()
    try:
        async with httpx.AsyncClient(timeout=11.0) as client:
            response = await client.post(
                f"{KAKAOPAY_BASE_URL}/{path}",
                headers={
                    "Authorization": f"SECRET_KEY {secret_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            data = response.json()
    except httpx.RequestError as exc:
        raise KakaoPayAPIError("카카오페이 결제 서버에 연결할 수 없습니다.") from exc
    except ValueError as exc:
        raise KakaoPayAPIError("카카오페이 응답을 해석하지 못했습니다.") from exc

    if response.is_error:
        raise KakaoPayAPIError(
            data.get("error_message") or "카카오페이 결제 요청에 실패했습니다."
        )
    return data


async def ready_payment(payload: dict) -> dict:
    _, cid, cid_secret = _settings()
    request_payload = {"cid": cid, **payload}
    if cid_secret:
        request_payload["cid_secret"] = cid_secret
    return await _post("ready", request_payload)


async def approve_payment(payload: dict) -> dict:
    _, cid, cid_secret = _settings()
    request_payload = {"cid": cid, **payload}
    if cid_secret:
        request_payload["cid_secret"] = cid_secret
    return await _post("approve", request_payload)
