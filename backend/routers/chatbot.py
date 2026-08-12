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
- VLUR CAPTCHA는 AI 기반 CAPTCHA 서비스입니다. 실측 지표는 분류 정확도 97.5%(자체 데이터셋 검증), 오탐률 0.3% 이하, 검증 처리량 초당 25~40건입니다.
- 사용 모델: 1D CNN과 BiLSTM 두 개의 딥러닝 모델을 앙상블하여 드래그 궤적을 분석합니다. CNN은 궤적의 형태·국소적인 움직임 패턴을, BiLSTM은 시간 순서에 따른 속도 변화의 문맥적 흐름을 분석해 서로 다른 유형의 봇을 보완적으로 탐지합니다. 정확한 임계값·내부 수치 등은 보안상 비공개입니다.
- CAPTCHA 유형: 두 유형 모두 경유 지점을 지나 정답 보기를 드래그하는 방식이며, 문제를 아스키아트로 보여주는 방식만 다릅니다. 유형 1은 한글 지시문을 아스키아트로, 유형 2는 이미지를 아스키아트로 표현합니다. 둘 다 드래그 궤적 검증으로 스크립트 봇을 탐지하며, 유형 1 실패 시 유형 2로 자동 전환됩니다.
- 요금제: Basic(무료, 월 10만 호출) / Pro(₩89,000/월, 월 50만 호출) / Enterprise(문의, 무제한)
- 결제: 카카오페이 단건결제 또는 토스페이먼츠 결제위젯 v2. 월 단위 구독이며 언제든 해지 가능합니다.
- API Key 발급: 이용 신청 페이지에서 요금제 선택 후 신청하면 즉시 발급. 마이페이지 > API Key 관리에서 확인 가능.
- 토큰: 검증 성공 시 발급되는 one-time token의 기본 유효 시간은 180초(3분). 재사용 불가, 만료 시 CAPTCHA 재시도 필요.
- 검증 처리량: 레코드 단위 초당 25~40건 (궤적 분석 포함).
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
            answer = await generate(client, 0.3)
            # 엉뚱한 문자 체계가 섞이면 한 번만 다시 생성한다. temperature를 올려 다른
            # 표현이 나오게 하고, 그래도 섞이면 해당 문장을 덜어낸다.
            if _FOREIGN_SCRIPT.search(answer):
                answer = await generate(client, 0.7)
        except httpx.HTTPStatusError:
            raise HTTPException(status_code=502, detail="챗봇 응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="챗봇 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.")

    if _FOREIGN_SCRIPT.search(answer):
        answer = _strip_trailing_foreign(answer) or (
            "죄송합니다, 답변을 정리하지 못했습니다. 다시 질문해 주시겠어요?"
        )
    return {"answer": answer}
