import os
import re
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from services.chatbot_rate_limit import consume_request
from services import knowledge_base

router = APIRouter(tags=["chatbot"])

# 검색된 지식을 몇 건까지 프롬프트에 넣을지. 늘릴수록 근거는 많아지지만 컨텍스트를
# 잡아먹고 답변이 산만해진다.
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "3"))
RAG_ENABLED = os.getenv("RAG_ENABLED", "1") == "1"

# Qwen 계열은 "联系我们"(중국어), "کیف"(아랍어)처럼 맥락과 무관한 다른 문자 체계를
# 섞는 습관이 있다 — "안녕" 같은 짧고 일반적인 인사에서 특히 잘 나온다. 프롬프트로
# 금지해도 눌리지 않는 토큰 수준의 습관이라 생성 결과를 직접 검사한다. 처음엔 한자만
# 걸렀는데 아랍어가 그대로 새는 걸 확인해서, 한국어 응답에 나올 일이 없는 문자 체계를
# 폭넓게 잡는다(중국어/일본어 가나/아랍어/히브리어/키릴/태국어/데바나가리).
_FOREIGN_SCRIPT = re.compile(
    r"[一-鿿぀-ヿ؀-ۿ֐-׿Ѐ-ӿ฀-๿ऀ-ॿ]"
)

# 문자는 한글인데 문장부호만 전각(。，！？：；)으로 나오는 경우가 있다 — 위 문자
# 체계 필터는 "글자"만 잡아서 이런 부호는 안 걸리고 그대로 새어나가 "습니다。"처럼
# 어색하게 보인다. 한국어 문장부호로 치환한다.
_FULLWIDTH_PUNCT = str.maketrans({
    "。": ".", "，": ",", "、": ",", "！": "!", "？": "?",
    "：": ":", "；": ";", "（": "(", "）": ")",
})


def _normalize_punctuation(text: str) -> str:
    return text.translate(_FULLWIDTH_PUNCT)

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

VLUR CAPTCHA는 AI 기반 CAPTCHA 서비스로, 1D CNN과 BiLSTM 앙상블 모델로 드래그 궤적을 분석해 봇을 탐지합니다. 실측 지표는 분류 정확도 97.5%, 오탐률 0.3% 이하, 검증 처리량 초당 25~40건입니다. 모델 레이어 구성이나 정확한 임계값 같은 세부 아키텍처 수치는 보안상 공개하지 않습니다.

[규칙]
- 아래 [참고 자료]로 검색된 문서를 최우선 근거로 답하세요. 문서에 없는 세부 수치·함수명·페이지 이름은 지어내지 말고, 모르면 "홈페이지 하단의 일반 문의 페이지나 이메일로 문의해달라"고 안내하세요.
- "이용 신청 페이지"라는 페이지는 존재하지 않습니다. 요금제는 메인페이지를 스크롤하면 나오는 섹션이지 별도 메뉴·페이지가 아니니, "상단 메뉴에서" 같은 표현을 쓰지 마세요.
- 아스키 지각, 아스키아트, 레이어 구성, 드래그 궤적, 토큰, rate limit, 공지사항, 깃허브, VLUR 의미, SDK, 다크모드, 위젯 커스터마이징, CSV 다운로드, 요금제 변경, API Key 노출, 코드 예시, 고객 이탈, CAPTCHA 배치 시점은 모두 VLUR CAPTCHA와 직접 관련된 질문입니다 — 무관한 질문으로 판단해 거절하지 마세요.
- 서비스와 전혀 무관한 질문(날씨, 다른 회사 제품 등)에만 "VLUR CAPTCHA 관련 문의만 도와드릴 수 있어요"라고 안내하세요.
- 아직 지원하지 않는 기능(예: 연 단위 구독)을 물으면 타사 서비스를 추천하지 말고 미지원 사실만 안내한 뒤 문의를 유도하세요. "~ 지원은 아닙니다"보다 "~는 지원하지 않습니다"처럼 자연스럽게 쓰세요.
- 같은 질문을 다시 물어도 이미 한 말을 표현만 바꿔 반복하지 마세요. 세부 수치가 비공개라면 그렇다고 말하되 "모른다"고 하지 말고, 참고 자료에 개략적인 설명이 있으면 그걸 활용하세요.
- "하루 방문자가 N명이면 비용이 얼마냐"처럼 트래픽 가정이 필요한 계산은 직접 하지 말고, 요금제별 월 호출 한도만 안내한 뒤 문의를 유도하세요."""


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


RAG_CONTEXT_TURNS = int(os.getenv("RAG_CONTEXT_TURNS", "3"))


def _build_search_query(history: list[dict]) -> str:
    """검색 질의를 마지막 한 마디가 아니라 최근 대화 맥락으로 구성한다.

    "더 자세히", "그럼 그건?"처럼 지시어만 있는 짧은 후속 질문은 그 문장 하나만으로는
    임베딩이 어떤 주제에도 잘 안 붙는다(min_score를 못 넘겨 검색 결과가 0건이 되고, 그러면
    LLM이 근거 없이 통째로 답변을 거절해버리는 문제로 이어졌다). 직전 몇 턴을 이어 붙이면
    "CNN 모델 설명 → 더 자세히" 같은 흐름에서 주제가 함께 실려 검색이 훨씬 잘 맞는다."""
    recent = history[-RAG_CONTEXT_TURNS:]
    return "\n".join(m["content"] for m in recent).strip()


def _build_system_prompt(history: list[dict]) -> str:
    """최근 대화 맥락과 관련된 지식을 찾아 시스템 프롬프트 뒤에 덧붙인다.

    검색이나 embed 서비스가 실패해도 챗봇 자체는 계속 동작해야 하므로, 예외가 나면
    검색 결과 없이 기본 프롬프트만 쓴다 — 부가 기능이 본 기능을 끌어내리지 않게.
    """
    if not RAG_ENABLED:
        return SYSTEM_PROMPT
    query = _build_search_query(history)
    if not query:
        return SYSTEM_PROMPT
    try:
        hits = knowledge_base.search(query, top_k=RAG_TOP_K)
    except Exception:
        return SYSTEM_PROMPT
    if not hits:
        return SYSTEM_PROMPT

    passages = "\n\n".join(f"### {h['title']}\n{h['content']}" for h in hits)
    return (
        f"{SYSTEM_PROMPT}\n\n"
        "[참고 자료]\n"
        "아래는 질문과 관련해 검색된 VLUR 서비스 문서입니다. 답변에 활용하되, "
        "여기 없는 내용을 지어내지 마세요.\n\n"
        f"{passages}"
    )


def _strip_trailing_foreign(text: str) -> str:
    """엉뚱한 문자 체계가 섞인 문장을 통째로 덜어낸다.

    글자만 지우면 '언제든지 하세요'처럼 어색한 문장이 남으므로 문장 단위로 버린다.
    남는 문장이 하나도 없으면 호출자가 안내 문구로 대체한다.
    """
    sentences = re.split(r"(?<=[.!?。])\s+|\n+", text)
    kept = [s for s in sentences if s.strip() and not _FOREIGN_SCRIPT.search(s)]
    return " ".join(kept).strip()


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

    system_prompt = _build_system_prompt(history)

    async def generate(client: httpx.AsyncClient, temperature: float) -> str:
        res = await client.post(
            CHATBOT_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": CHATBOT_MODEL,
                "messages": [{"role": "system", "content": system_prompt}, *history],
                "max_tokens": 500,
                "temperature": temperature,
            },
        )
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            answer = _normalize_punctuation(await generate(client, 0.3))
            # 엉뚱한 문자 체계가 섞이면 한 번만 다시 생성한다. temperature를 올려 다른
            # 표현이 나오게 하고, 그래도 섞이면 해당 문장을 덜어낸다.
            if _FOREIGN_SCRIPT.search(answer):
                answer = _normalize_punctuation(await generate(client, 0.7))
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=502, detail="챗봇 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="챗봇 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    if _FOREIGN_SCRIPT.search(answer):
        answer = _strip_trailing_foreign(answer) or (
            "죄송합니다, 답변을 정리하지 못했습니다. 다시 질문해 주시겠어요?"
        )
    return {"answer": answer}
