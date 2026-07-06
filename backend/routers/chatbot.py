import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["chatbot"])

OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """당신은 'VLUR CAPTCHA' 서비스의 고객 지원 챗봇입니다.
한국어로 친절하고 간결하게(3~5문장 이내) 답변하세요.

[서비스 정보]
- VLUR CAPTCHA는 AI 기반 CAPTCHA 서비스입니다. 봇 차단율 99.2%, 분류 정확도 98.6%가 목표 지표입니다.
- CAPTCHA 유형: 유형 1(4지선다 클릭), 유형 2(드래그-투-타깃). 유형 2 실패 시 유형 1로 자동 폴백됩니다. 드래그 궤적 검증으로 스크립트 봇도 탐지합니다.
- 요금제: Basic(무료, 월 10만 호출) / Pro(₩89,000/월, 월 50만 호출) / Enterprise(문의, 무제한)
- 결제: KakaoPay 단건결제 또는 토스페이먼츠 결제위젯 v2. 월 단위 구독이며 언제든 해지 가능합니다.
- API Key 발급: 이용 신청 페이지에서 요금제 선택 후 신청하면 즉시 발급. 마이페이지 > API Key 관리에서 확인 가능.
- 토큰: 검증 성공 시 발급되는 one-time token의 기본 유효 시간은 180초(3분). 재사용 불가, 만료 시 CAPTCHA 재시도 필요.
- 검증 속도: 평균 응답 약 120ms (정답 키 + 드래그 궤적 채점 포함 서버 응답 기준).
- SDK: React, Vue, FastAPI, Node.js, Django 등 지원. 이용 신청 완료 후 가이드 페이지에서 확인.
- 마이페이지: 우측 상단 [로그인] 후 API Key 관리, 사용량 조회 가능.

[규칙]
- 서비스와 무관한 질문에는 "VLUR CAPTCHA 관련 문의만 도와드릴 수 있어요"라고 안내하세요.
- 모르는 내용은 지어내지 말고, 문의(Contact) 페이지 또는 이메일 문의를 안내하세요."""


class ChatMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@router.post("/chatbot")
async def chat(body: ChatRequest):
    api_key = os.getenv("OPENAI_API_KEY")
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

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            res = await client.post(
                OPENAI_API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": OPENAI_MODEL,
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
