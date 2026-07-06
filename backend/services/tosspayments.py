import base64
import os

import httpx


TOSS_API_BASE_URL = "https://api.tosspayments.com/v1/payments"


class TossPaymentsConfigurationError(RuntimeError):
    pass


class TossPaymentsAPIError(RuntimeError):
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


def get_client_key() -> str:
    client_key = os.getenv("TOSS_CLIENT_KEY", "").strip()
    if not client_key:
        raise TossPaymentsConfigurationError("TOSS_CLIENT_KEY가 설정되지 않았습니다.")
    return client_key


def _authorization_header() -> str:
    secret_key = os.getenv("TOSS_SECRET_KEY", "").strip()
    if not secret_key:
        raise TossPaymentsConfigurationError("TOSS_SECRET_KEY가 설정되지 않았습니다.")
    credentials = base64.b64encode(f"{secret_key}:".encode()).decode()
    return f"Basic {credentials}"


async def confirm_payment(payload: dict, idempotency_key: str) -> dict:
    headers = {
        "Authorization": _authorization_header(),
        "Content-Type": "application/json",
        "Idempotency-Key": idempotency_key,
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                f"{TOSS_API_BASE_URL}/confirm",
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise TossPaymentsAPIError("토스페이먼츠 서버에 연결할 수 없습니다.") from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise TossPaymentsAPIError("토스페이먼츠 응답을 확인할 수 없습니다.") from exc

    if response.is_error:
        raise TossPaymentsAPIError(
            data.get("message") or "토스페이먼츠 승인 요청에 실패했습니다.",
            data.get("code"),
        )

    return data
