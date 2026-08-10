"""모델 출력을 관리자용 0~100 위험 지수로 변환한다.

보안 판정은 체크포인트의 원래 threshold를 그대로 사용한다. 이 모듈의 함수는
서로 다른 모델 출력을 공통 축으로 표시하기 위한 위험 지수를 만든다. 표시용
지수이며 보정된 봇 확률로 해석하면 안 된다.
"""

import math

DEFAULT_RISK_TEMPERATURE = 10.0
DEFAULT_ENSEMBLE_RISK_TEMPERATURE = 3.0


def threshold_normalized_risk_score(
    score: float,
    threshold: float,
    temperature: float = DEFAULT_ENSEMBLE_RISK_TEMPERATURE,
) -> float:
    """모델의 판정 임계점을 50점으로 고정한 단조 위험 지수(0~1)를 반환한다.

    임계값이 서로 다른 CNN과 BiLSTM 출력을 같은 0~100 축에서 비교하기
    위한 표시용 점수다. 로짓 거리를 temperature로 완만하게 압축해 매우 작은
    정상 출력도 관리자 화면에서 구분되게 한다. 원본 순서와 0/1 끝점을
    유지하며 score == threshold이면 항상 0.5가 된다.
    """
    if not math.isfinite(score) or not 0.0 <= score <= 1.0:
        raise ValueError("모델 점수는 0과 1 사이여야 합니다.")
    if not math.isfinite(threshold) or not 0.0 < threshold < 1.0:
        raise ValueError("모델 임계값은 0과 1 사이여야 합니다.")
    if not math.isfinite(temperature) or temperature <= 0.0:
        raise ValueError("temperature는 0보다 커야 합니다.")

    if score == 0.0:
        return 0.0
    if score == 1.0:
        return 1.0

    score_logit = probability_to_logit(score)
    threshold_logit = probability_to_logit(threshold)
    return stable_sigmoid((score_logit - threshold_logit) / temperature)


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
