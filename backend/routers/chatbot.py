import os
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from services.chatbot_rate_limit import consume_request

router = APIRouter(tags=["chatbot"])

# 챗봇 LLM 엔드포인트. 기본값은 OpenAI지만, vLLM처럼 OpenAI 호환 API를 제공하는 서버를
# 띄웠다면 CHATBOT_API_URL/CHATBOT_MODEL만 바꿔서 그쪽으로 보낼 수 있다(요청·응답 스키마가
# 같아서 아래 호출 코드는 그대로 쓴다).
CHATBOT_API_URL = os.getenv("CHATBOT_API_URL", "https://api.openai.com/v1/chat/completions")
CHATBOT_MODEL = os.getenv("CHATBOT_MODEL", "gpt-4o-mini")

# 자체 호스팅 서버는 클러스터 내부에서만 접근 가능해 인증이 따로 없다 — 그래도 OpenAI
# 호환 API가 Authorization 헤더를 요구하므로 자리표시자를 보낸다.
CHATBOT_API_KEY_PLACEHOLDER = "not-required-for-self-hosted"


def _is_self_hosted() -> bool:
    return not CHATBOT_API_URL.startswith("https://api.openai.com/")


def _resolve_api_key() -> str | None:
    """자체 호스팅으로 전환한 뒤에도 OPENAI_API_KEY는 롤백용으로 .env에 남겨두므로,
    실제 OpenAI로 보낼 때만 그 키를 쓴다 — 내부 LLM 서버에 외부 키가 흘러가지 않게."""
    if _is_self_hosted():
        return CHATBOT_API_KEY_PLACEHOLDER
    return os.getenv("OPENAI_API_KEY")


SYSTEM_PROMPT = """당신은 'VLUR CAPTCHA' 서비스의 고객 지원 챗봇입니다.
한국어로 친절하고 간결하게(3~5문장 이내) 답변하세요.

[서비스 정보]
- VLUR CAPTCHA는 AI 기반 CAPTCHA 서비스입니다. 봇 차단율 99.2%, 분류 정확도 98.6%가 목표 지표입니다.
- CAPTCHA 유형: 유형 1(드래그-투-타깃), 유형 2(경유 지점을 지나 정답 보기를 드래그). 둘 다 드래그 궤적 검증으로 스크립트 봇을 탐지하며, 유형 2 실패 시 유형 1로 자동 폴백됩니다.
- 요금제: Basic(무료, 월 10만 호출) / Pro(₩89,000/월, 월 50만 호출) / Enterprise(문의, 무제한)
- 결제: KakaoPay 단건결제 또는 토스페이먼츠 결제위젯 v2. 월 단위 구독이며 언제든 해지 가능합니다.
- API Key 발급: 이용 신청 페이지에서 요금제 선택 후 신청하면 즉시 발급. 마이페이지 > API Key 관리에서 확인 가능.
- 토큰: 검증 성공 시 발급되는 one-time token의 기본 유효 시간은 180초(3분). 재사용 불가, 만료 시 CAPTCHA 재시도 필요.
- 검증 속도: 평균 응답 약 120ms (정답 키 + 드래그 궤적 채점 포함 서버 응답 기준).
- SDK: React, Vue, FastAPI, Node.js, Django 등 지원. 이용 신청 완료 후 가이드 페이지에서 확인.
- 마이페이지: 우측 상단 [로그인] 후 API Key 관리, 사용량 조회, 결제 내역, 계정 탈퇴 등을 확인할 수 있습니다.
- 비밀번호 변경: 마이페이지 > 내 정보 탭 > "비밀번호 변경" 버튼 클릭 → 현재 비밀번호 확인 후 새 비밀번호(8~16자, 영문 대소문자·숫자·특수문자 포함)를 입력하면 변경됩니다.
- 이메일 인증: 회원가입 시 이메일로 발송되는 인증코드(6자리)를 입력해 인증합니다. 인증코드는 발급 후 일정 시간(수 분) 내에만 유효합니다.
- 계정 탈퇴: 마이페이지 > 계정 탈퇴 탭에서 진행할 수 있으며, 탈퇴 시 API Key와 데이터가 삭제됩니다.
- 로그인 방법: 이메일/아이디 로그인 외에 카카오·네이버·구글 소셜 로그인을 지원합니다.

[규칙]
- 서비스와 무관한 질문에는 "VLUR CAPTCHA 관련 문의만 도와드릴 수 있어요"라고 안내하세요.
- 모르는 내용은 지어내지 말고, 문의(Contact) 페이지 또는 이메일 문의를 안내하세요."""


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=10)


def _client_ip(request: Request) -> str:
    """프록시 헤더를 명시적으로 신뢰할 때만 실제 클라이언트 IP를 사용한다."""
    if os.getenv("TRUST_PROXY_HEADERS") == "1":
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/chatbot")
async def chat(body: ChatRequest, request: Request):
    api_key = _resolve_api_key()
    if not api_key:
        raise HTTPException(status_code=503, detail="챗봇 서비스가 아직 설정되지 않았습니다.")

    # 최근 10개 메시지만 전달해 토큰 사용량 제한
    history = [
        {"role": m.role, "content": m.content}
        for m in body.messages[-10:]
        if m.role in ("user", "assistant")
    ]
    if not history:
        raise HTTPException(status_code=400, detail="메시지가 비어 있습니다.")

    retry_after = consume_request(_client_ip(request))
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "chatbot_rate_limited",
                "message": f"챗봇 요청이 많습니다. {retry_after}초 후 다시 시도해 주세요.",
                "retry_after": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            res = await client.post(
                CHATBOT_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": CHATBOT_MODEL,
                    "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *history],
                    "max_tokens": 500,
                    "temperature": 0.3,
                },
            )
            res.raise_for_status()
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=502, detail="챗봇 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="챗봇 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    answer = res.json()["choices"][0]["message"]["content"]
    return {"answer": answer}
