"""정답 판정과 CNN 행동 판정을 최종 인증 결과로 결합한다."""

VALID_TIERS = {"verified", "ambiguous", "blocked"}


def resolve_verification(is_correct: bool, behavior_tier: str) -> dict:
    """정답 여부와 행동 판정을 결합하되, 두 신호의 의미는 분리해서 유지한다."""
    if behavior_tier not in VALID_TIERS:
        raise ValueError(f"지원하지 않는 행동 판정입니다: {behavior_tier!r}")

    is_bot = {
        "verified": False,
        "ambiguous": None,
        "blocked": True,
    }[behavior_tier]

    result = {
        "verified": False,
        "ambiguous": False,
        "blocked": behavior_tier == "blocked",
        "answerCorrect": bool(is_correct),
        "behaviorTier": behavior_tier,
    }

    # 오답은 행동이 사람처럼 보여도 최종 인증 실패다. 다만 CNN 점수와 is_bot은
    # 그대로 저장해서 "오답=봇 100점"으로 왜곡하지 않는다.
    if not is_correct:
        return {
            "captcha_status": "failed",
            "is_bot": is_bot,
            "verification_status": "failed",
            "failure_reason": "wrong_answer",
            "issue_token": False,
            "result": result,
        }

    if behavior_tier == "blocked":
        return {
            "captcha_status": "failed",
            "is_bot": True,
            "verification_status": "failed",
            "failure_reason": "bot_blocked",
            "issue_token": False,
            "result": result,
        }

    if behavior_tier == "ambiguous":
        result["ambiguous"] = True
        return {
            "captcha_status": "expired",
            "is_bot": None,
            "verification_status": "pending",
            "failure_reason": "ambiguous_behavior",
            "issue_token": False,
            "result": result,
        }

    result["verified"] = True
    return {
        "captcha_status": "verified",
        "is_bot": False,
        "verification_status": "passed",
        "failure_reason": None,
        "issue_token": True,
        "result": result,
    }
