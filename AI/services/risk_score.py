"""CNN 사람 로짓을 관리자용 0~100 위험 지수로 변환한다.

보안 판정은 체크포인트의 원래 human threshold를 그대로 사용한다. 이 모듈의 점수는
관리자가 정상 트래픽 안에서도 상대적인 차이를 볼 수 있도록 로짓을 완만하게 압축한
표시용 위험 지수이며, 보정된 확률이라고 해석하면 안 된다.
"""

import math

DEFAULT_RISK_TEMPERATURE = 10.0


def stable_sigmoid(value: float) -> float:
    """큰 절댓값에서도 overflow나 1 - sigmoid 정밀도 손실 없이 계산한다."""
    if value >= 0:
        exp_neg = math.exp(-value)
        return 1.0 / (1.0 + exp_neg)
    exp_pos = math.exp(value)
    return exp_pos / (1.0 + exp_pos)


def probability_to_logit(probability: float) -> float:
    if not 0.0 < probability < 1.0:
        raise ValueError("확률은 0과 1 사이여야 합니다.")
    return math.log(probability / (1.0 - probability))


def calibrated_risk_score(
    human_logit: float,
    human_threshold: float,
    temperature: float = DEFAULT_RISK_TEMPERATURE,
) -> float:
    """사람 판정 임계 로짓을 50점으로 고정한 단조 위험 지수(0~1)를 반환한다.

    risk = sigmoid((threshold_logit - human_logit) / temperature)

    - 사람 로짓이 높을수록 위험 점수는 낮아진다.
    - 기존 판정 임계점은 항상 50점이다.
    - temperature는 표시 분포만 조절하며 보안 판정에는 영향을 주지 않는다.
    """
    if temperature <= 0:
        raise ValueError("temperature는 0보다 커야 합니다.")
    threshold_logit = probability_to_logit(human_threshold)
    return stable_sigmoid((threshold_logit - human_logit) / temperature)
