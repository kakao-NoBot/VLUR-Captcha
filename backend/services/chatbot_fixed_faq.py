"""운영 LLM의 판단에 맡기지 않고 항상 같은 내용을 주어야 하는 챗봇 FAQ."""

import re


AUTOMATION_TEST_FAQ_ANSWER = (
    "네, 실제 매크로를 사용하여 뚫어보는 테스트를 진행했습니다. "
    "이 과정에서 유형1 인식 지연이 발생하고, 이후 드래그 궤적으로 봇 판별이 이루어지며, "
    "유형2로 전환된 후에도 판독 지연이 발생하여 재차 차단되는 과정을 확인했습니다."
)

_AUTOMATION_TEST_SUBJECT = re.compile(
    r"매크로|스크립트|ai\s*에이전트|인공지능\s*에이전트|codex",
    re.IGNORECASE,
)
_AUTOMATION_TEST_ACTION = re.compile(r"뚫어|통과|우회|테스트|시험|검증")
_AUTOMATION_TEST_COMPLETED = re.compile(
    r"해\s*봤|해\s*본|했(?:어|나|냐|나요|어요|습니까|는지)|"
    r"진행했|테스트했|시험했|검증했"
)
_ATTACK_HOWTO_REQUEST = re.compile(
    r"(?:방법|순서|절차|코드).{0,12}(?:알려|작성|짜|만들)|"
    r"(?:알려|작성|짜|만들).{0,12}(?:방법|순서|절차|코드)"
)


def fixed_faq_answer(question: str) -> str | None:
    """자체 자동화 검증 여부를 묻는 질문에 확정된 답을 반환한다.

    공격 방법을 요청하는 질문은 여기서 가로채지 않고 기존 보안 규칙을 거친다.
    """
    if _ATTACK_HOWTO_REQUEST.search(question):
        return None
    if not _AUTOMATION_TEST_SUBJECT.search(question):
        return None
    if not _AUTOMATION_TEST_ACTION.search(question):
        return None
    if not _AUTOMATION_TEST_COMPLETED.search(question):
        return None
    return AUTOMATION_TEST_FAQ_ANSWER
