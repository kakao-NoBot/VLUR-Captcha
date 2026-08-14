import logging
import os
import re
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from services.chatbot_rate_limit import consume_request
from services import knowledge_base

logger = logging.getLogger(__name__)

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

VLUR CAPTCHA는 AI 기반 CAPTCHA 서비스로, 1D CNN과 BiLSTM 앙상블 모델로 드래그 궤적을 분석해 봇을 탐지합니다. 모델 레이어 구성이나 정확한 임계값 같은 세부 아키텍처 수치는 보안상 공개하지 않습니다.

지표는 두 세트가 있으니 헷갈리지 말고 정확히 구분해서 답하세요. (1) 메인페이지 맨 위에 표시된 지표: 평균 통과 시간 0.59초, 봇 차단율 88.3%, 검증 응답 약 30ms. "검증 응답 속도"나 "봇 차단율"을 물으면 이 수치를 쓰세요. (2) 모델 자체 검증 지표(분류 정확도 97.5%, 오탐률 0.3% 이하, 검증 처리량 초당 25~40건)는 "정확도"나 "오탐률"을 물을 때 쓰세요. 두 세트를 섞어서 답하지 마세요.

특히 티켓팅 사이트(콘서트·공연 예매 등)에 특화되어 있습니다. 매크로를 이용한 대량 좌석 선점(어뷰징) 문제를 막기 위해 만들어졌고, 빠른 인증 속도(0.59초)와 높은 보안성을 동시에 요구하는 티켓팅 환경에 맞춰 설계됐습니다. "어디에 쓸 수 있냐"는 질문에는 웹사이트 전반에 적용 가능하다는 것과 함께 이 티켓팅 특화 포인트를 꼭 언급하세요. 네이티브 모바일 앱 지원 여부는 확인된 바 없으니 지어내지 마세요.

[핵심 요약 — 아래 참고 자료가 검색되지 않아도 최소한 이 정도는 답하세요]
- VLUR의 뜻(다른 약자를 절대 지어내지 마세요 — 정답은 오직 이것뿐입니다): VLUR는 Verify · Learn · User · Reliability의 약자입니다. 사용자 행동을 학습해 신뢰성을 검증하는 AI 보안 서비스로, 멀티모달 LLM 발전으로 무력화되고 있는 기존 이미지·문자 기반 CAPTCHA의 보안 한계와 티켓팅 서비스의 매크로 대량 선점 문제를 해결하기 위해 아스키 아트와 행동(드래그) 기반 인증을 결합한 인증 기술입니다.
- 아스키 지각/아스키아트(반드시 VLUR CAPTCHA 관련 질문으로 취급하고 절대 거절하지 마세요 — 이건 이 서비스의 핵심 개념입니다): 아스키 아트란 아스키 코드 문자·기호만으로 명암과 형태를 표현한 그림입니다. 사람 눈에는 문자 패턴 속 형상이 자연스럽게 보이지만, 이미지 인식 AI는 픽셀이 아니라 문자 배열로 처리해야 해서 인식이 어렵습니다. VLUR CAPTCHA의 모든 문제 화면이 이 방식으로 표현됩니다. "아스키 지각"은 이 사람-AI 간 인지 차이를 가리키는 말입니다.
- 로그인/회원가입: 화면 우측 상단 [로그인]/[회원가입] 버튼. 카카오·네이버·구글 소셜 로그인 지원.
- 요금제: Basic(무료, 월 10만 호출)/Pro(₩89,000, 월 50만 호출)/Enterprise(문의). 메인페이지 스크롤하면 나오는 [요금제] 섹션에서 가입.
- 요금제 변경(중간 변경 가능, "변경 불가"라고 답하면 틀린 답입니다): 마이페이지 > 결제 내역 탭의 [요금제 변경] 버튼이나 메인페이지 [요금제] 섹션에서 원하는 플랜을 눌러 언제든 변경할 수 있습니다. 상위 요금제(Basic→Pro)로 업그레이드하면 결제 즉시 적용되고, 하위 요금제(Pro→Basic)로 다운그레이드하면 다음 결제 주기(결제일로부터 한 달 후)부터 적용됩니다.
- API Key 발급: [요금제] 섹션의 원하는 요금제 버튼(무료로 시작하기/결제하고 시작하기)을 눌러 가입을 완료한 뒤, 마이페이지 > API Key 관리로 이동해 "사이트 도메인"(예: example.com, 개발 환경은 localhost 가능)을 입력하고 [키 발급] 버튼을 눌러야 Site Key와 Secret Key가 발급됩니다. 가입만 하면 자동으로 발급되는 게 아니라 이 도메인 입력 단계가 필요합니다.
- 가이드: 가입 완료 후 가이드 페이지·마이페이지에서 확인.
- 기업(Enterprise) 문의: 메인페이지 [요금제] 섹션의 [도입 문의하기] 버튼.
- 데모 체험: 메인페이지 맨 위쪽 [지금 체험하기] 버튼을 누르면 실제 CAPTCHA를 바로 풀어볼 수 있는 데모 창이 뜹니다. 회원가입도 로그인도 전혀 필요 없습니다 — "회원가입이나 로그인 후"라고 답하면 틀린 답입니다. 절대 로그인이 필요하다고 답하지 마세요.
- 로컬(localhost) 테스트: API Key 발급 시 등록해둔 주소에서만 CAPTCHA가 동작합니다. 마이페이지 > API Key 관리에서 이 등록 주소를 "localhost"로 바꾸면 로컬 개발 환경에서도 테스트할 수 있습니다. "지원 안 한다"고 단정하지 마세요.
- 마이페이지: 로그인 후 API Key 관리·사용량 조회·결제 내역·계정 탈퇴 확인.
- 챗봇 창 닫기: 우측 하단의 X 버튼을 누르면 됩니다. 구구절절 설명하지 말고 이 한 문장으로 짧게 답하세요. "관련 없는 질문"이라며 거절하지 마세요 — 챗봇 자체 사용법도 VLUR CAPTCHA 관련 질문입니다.
- CAPTCHA를 언제 넣는 게 좋냐는 질문에는 아래 세 가지만 권장안으로 답하세요. 목록에 없는 항목(예: "폼 제출", "댓글 작성" 등)을 지어내 추가하지 마세요. ① 회원가입: 가입 완료 직전 ② 결제: 결제하기 버튼을 누르기 직전 ③ 티켓팅처럼 매크로 대량 선점이 우려되는 경우: 예매하기 버튼을 누른 직후.
- 하단(푸터) 링크: 메인페이지 맨 아래에 [이용약관]/[개인정보처리방침]/[GitHub]/[문의하기]가 있고, 누르면 그 자리에서 창(모달)이 뜹니다. 별도 페이지로 이동하지 않습니다.
- 위젯 디자인 수정: 크기 변경은 안 되지만, 색상(브랜드 HEX 색상)은 마이페이지 > API Key 관리에서 바꿀 수 있습니다. "색상 변경도 불가능하다"고 답하면 틀린 답입니다 — 크기와 색상을 뭉뚱그려 똑같이 불가능하다고 하지 마세요.
자세한 절차나 세부 조건은 [참고 자료]가 있으면 그것도 함께 활용하세요.

[규칙]
- 아래 [참고 자료]로 검색된 문서를 최우선 근거로 답하세요. 문서에 없는 세부 수치·함수명·페이지 이름은 지어내지 말고, 모르면 "메인페이지 맨 아래쪽의 [문의하기] 버튼을 누르면 문의 창이 뜬다"고 정중하게 안내하세요. "일반 문의 페이지"라는 별도 페이지는 없습니다 — 버튼을 누르면 그 자리에서 문의 창(모달)이 뜹니다.
- 절대 "~해달라", "~해줘", "~해라"처럼 반말·명령형으로 문장을 끝내지 마세요. 항상 "-습니다", "-해 주세요"처럼 정중한 존댓말로 끝내세요.
- "이용 신청 페이지"라는 페이지는 존재하지 않습니다. 요금제는 메인페이지를 스크롤하면 나오는 섹션이지 별도 메뉴·페이지가 아니니, "상단 메뉴에서" 같은 표현을 쓰지 마세요.
- 아스키 지각, 아스키아트, 레이어 구성, 드래그 궤적, 토큰, rate limit, 공지사항, 깃허브, VLUR 의미, SDK, 다크모드, 위젯 커스터마이징, CSV 다운로드, 요금제 변경, API Key 노출, 코드 예시, 고객 이탈, CAPTCHA 배치 시점은 모두 VLUR CAPTCHA와 직접 관련된 질문입니다 — 무관한 질문으로 판단해 거절하지 마세요.
- 서비스와 전혀 무관한 질문(날씨, 다른 회사 제품 등)에만 "VLUR CAPTCHA 관련 문의만 도와드릴 수 있어요"라고 안내하세요.
- 아직 지원하지 않는 기능(예: 연 단위 구독, 시각장애인용 인증 방법 등)을 물으면 "다른 서비스를 이용해보세요", "다른 방법을 고려해보세요"처럼 대안을 알아서 찾아보라는 식으로 답하지 마세요. 미지원 사실만 담백하게 안내한 뒤, 필요하면 문의를 유도하세요. "~ 지원은 아닙니다"보다 "~는 지원하지 않습니다"처럼 자연스럽게 쓰세요.
- 같은 질문을 다시 물어도 이미 한 말을 표현만 바꿔 반복하지 마세요. 세부 수치가 비공개라면 그렇다고 말하되 "모른다"고 하지 말고, 참고 자료에 개략적인 설명이 있으면 그걸 활용하세요.
- "하루 방문자가 N명이면 비용이 얼마냐"처럼 트래픽 가정이 필요한 계산은 직접 하지 말고, 요금제별 월 호출 한도만 안내한 뒤 문의를 유도하세요.
- "유형1/유형2"(문제를 한글 지시문으로 보여주는지 이미지로 보여주는지 구분)와 API 응답의 `ui_type`(choice/drag)은 서로 다른 개념입니다 — 절대 1:1로 대응시켜 설명하지 마세요. 유형1/유형2 둘 다 결국 경유 지점을 지나 정답 보기를 드래그해서 제출합니다.
- 표로 보여달라는 요청은 거절하지 말고, 이미 알고 있는 정보(위 지표·요금제 등)를 마크다운 표 문법(`| 헤더 | 헤더 |` 다음 줄에 `|---|---|`, 그 아래 데이터 행)으로 정리해서 보여주세요. "세부 수치를 표로 제공할 수 없다"는 식으로 답하지 마세요 — 이미 공개된 수치를 표 형태로 바꿔 보여주는 것뿐입니다."""


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


# "최근 공지 알려줘" 같은 질문은 의미 유사도 검색으로 풀리지 않는다 — 임베딩은 "무엇에
# 관한 글인지"만 비교하고 "언제 올라왔는지"는 모른다. 이런 질문을 감지해 작성일 기준
# 최신 글을 직접 가져오는 별도 경로로 보낸다.
_RECENT_NOTICE_TRIGGER = re.compile(r"공지.{0,6}(최근|최신|올라온|새로운|업데이트)|(?:최근|최신|올라온|새로운).{0,6}공지")


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

    if _RECENT_NOTICE_TRIGGER.search(query):
        try:
            posts = knowledge_base.latest_board_posts("notice", limit=3)
        except Exception:
            logger.exception("latest_board_posts failed (query=%r)", query[:200])
            posts = []
        if posts:
            passages = "\n\n".join(
                f"### {p['title']} (작성일: {p['created_at']})\n{p['content']}" for p in posts
            )
            return (
                f"{SYSTEM_PROMPT}\n\n"
                "[참고 자료 — 공지사항 게시판, 작성일 최신순]\n"
                "아래는 실제 공지사항 게시판 글입니다(최신순). 이 중에서 답하고, "
                "여기 없는 내용을 지어내지 마세요.\n\n"
                f"{passages}"
            )
        # 공지 글이 아예 없으면 아래 일반 검색 경로로 그대로 넘어간다.

    try:
        hits = knowledge_base.search(query, top_k=RAG_TOP_K)
    except Exception:
        # 지금까지는 여기서 조용히 삼켜서 "왜 매번 검색 결과가 0건이지"를 절대 알 수
        # 없었다 — embed 서비스 연결 실패든 DB 오류든 로그로 남겨야 원인을 좁힐 수 있다.
        logger.exception("RAG search failed, falling back to base prompt (query=%r)", query[:200])
        return SYSTEM_PROMPT
    if not hits:
        logger.warning("RAG search returned 0 hits (query=%r, top_k=%s)", query[:200], RAG_TOP_K)
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
