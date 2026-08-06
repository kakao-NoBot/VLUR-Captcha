"""CNN + BiLSTM 앙상블 드래그 봇 판별 모델의 서빙 래퍼."""

import math
import os
import sys
from pathlib import Path


# 저장소 루트에서 AI 패키지를 import해도 ml 패키지의 절대 import가 동작하게 한다.
AI_ROOT = Path(__file__).resolve().parent.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from ml.ensemble.ensemble_predictor import EnsemblePredictor  # noqa: E402


MODEL_DIR = AI_ROOT / "model"
DEFAULT_MODEL_NAME = "ensemble_checkpoint.pt"
DEFAULT_MODEL_VERSION = "cnn-bilstm-ensemble-v1"
MODEL_VERSION_MAX_LENGTH = 128
AMBIGUOUS_MARGIN = 0.03
_POINTER_INDEX = {"mouse": 0, "touch": 1, "pen": 2}

_ckpt_path = Path(os.getenv("MODEL_PATH", str(MODEL_DIR / DEFAULT_MODEL_NAME)))
if not _ckpt_path.is_file():
    raise RuntimeError(f"지정된 모델 체크포인트가 없습니다: {_ckpt_path}")

MODEL_VERSION = os.getenv("MODEL_VERSION", DEFAULT_MODEL_VERSION).strip()
if not MODEL_VERSION:
    raise RuntimeError("MODEL_VERSION은 빈 문자열일 수 없습니다.")
if len(MODEL_VERSION) > MODEL_VERSION_MAX_LENGTH:
    raise RuntimeError(
        f"MODEL_VERSION은 {MODEL_VERSION_MAX_LENGTH}자 이하여야 합니다: {MODEL_VERSION!r}"
    )

# .pt 안의 CNN, BiLSTM, 결합기와 jitter guard를 공식 numpy 추론 구현에 연결한다.
_predictor = EnsemblePredictor.from_torch_checkpoint(str(_ckpt_path))
if _predictor.cnn.weights["scalar_branch.0.weight"].shape[1] != 19:
    raise RuntimeError("앙상블 CNN은 scalar 19차원 입력을 기대해야 합니다.")
if _predictor.bilstm.seq_mu.shape != (10,) or _predictor.bilstm.seq_sd.shape != (10,):
    raise RuntimeError("앙상블 BiLSTM은 10채널 시퀀스 정규화 통계를 기대해야 합니다.")
if _predictor.jitter_guard is None:
    raise RuntimeError("앙상블 체크포인트에 jitter guard가 없습니다.")

MODEL_INFO = {
    "method": "or_rule",
    "components": ["ultra_cnn_v2", "bilstm", "jitter_guard"],
    "cnn_scalar_dim": 19,
    "bilstm_sequence_dim": 10,
    "bilstm_condition_dim": 22,
    "cnn_human_thresholds": [float(value) for value in _predictor.cnn.pointer_thresholds],
    "bilstm_bot_thresholds": {
        str(key): float(value)
        for key, value in _predictor.bilstm.threshold_by_pointer.items()
    },
    "jitter_guard_threshold": float(_predictor.jitter_guard.threshold),
}


def _probability_to_logit(probability: float) -> float:
    probability = min(max(probability, 1e-12), 1.0 - 1e-12)
    return math.log(probability / (1.0 - probability))


def _component_thresholds(pointer_type: str) -> dict[str, float]:
    pointer_index = _POINTER_INDEX.get(pointer_type)
    if pointer_index is None:
        cnn_threshold = 1.0 - float(_predictor.cnn.global_threshold)
        bilstm_threshold = float(_predictor.bilstm.threshold_global)
    else:
        cnn_threshold = 1.0 - float(_predictor.cnn.pointer_thresholds[pointer_index])
        bilstm_threshold = float(
            _predictor.bilstm.threshold_by_pointer.get(
                pointer_index,
                _predictor.bilstm.threshold_global,
            )
        )
    return {
        "cnn": cnn_threshold,
        "bilstm": bilstm_threshold,
        "jitter_guard": float(_predictor.jitter_guard.threshold),
    }


def classify(record: dict) -> dict:
    """2-way OR-rule(CNN+BiLSTM) 결과를 backend의 verified/ambiguous/blocked 계약으로 변환한다.

    jitter_guard는 기본적으로 안 쓴다(2026-08-05 결정 — ensemble_CNN_biLSTM/README.md
    §jitter_guard 후기 참고): 팀 red-team(n=200)에서 direct-POST 방어 기여는 0.5%/0%뿐인데
    human FPR을 or_rule 기준 ~0.3%대에서 6.20%로 끌어올리는 "순수 비용"으로 확인됐다.
    체크포인트엔 여전히 로드돼 있어 필요하면 다시 켤 수 있지만(predict_record 호출에
    use_jitter_guard=True), 그때는 아래 component_scores 구성도 jitter_guard_bot_score가
    None일 수 있다는 가정을 계속 유지해야 한다(안 그러면 float(None)에서 TypeError → 이
    함수 바깥의 fail-closed 처리로 모든 요청이 봇 판정된다 — 실제로 있었던 문제).
    """
    component_scores = None
    component_thresholds = None
    triggered_models = []
    try:
        prediction = _predictor.predict_record(record, method="or_rule", use_jitter_guard=False)
        pointer_type = str(prediction["cnn_pointer_type"])
        component_scores = {
            "cnn": float(prediction["cnn_bot_score"]),
            "bilstm": float(prediction["bilstm_bot_score"]),
        }
        if prediction["jitter_guard_bot_score"] is not None:
            component_scores["jitter_guard"] = float(prediction["jitter_guard_bot_score"])
        if any(not math.isfinite(score) or not 0.0 <= score <= 1.0 for score in component_scores.values()):
            raise ValueError(f"유효하지 않은 앙상블 점수입니다: {component_scores!r}")

        component_thresholds = _component_thresholds(pointer_type)
        triggered_models = [
            name
            for name, score in component_scores.items()
            if score > component_thresholds[name]
        ]
        raw_bot_probability = max(component_scores.values())
        human_probability = 1.0 - raw_bot_probability
        human_logit = _probability_to_logit(human_probability)
        is_bot = bool(prediction["is_bot"])
        ambiguous = any(
            abs(component_scores[name] - component_thresholds[name]) < AMBIGUOUS_MARGIN
            for name in component_scores
        )
        error = None
    except (KeyError, ValueError, IndexError, TypeError, RuntimeError, FloatingPointError) as exc:
        pointer_type = "unknown"
        human_probability = 0.0
        raw_bot_probability = 1.0
        human_logit = -100.0
        is_bot = True
        ambiguous = False
        error = str(exc)

    if error is not None:
        tier = "blocked"
    elif ambiguous:
        tier = "ambiguous"
    elif is_bot:
        tier = "blocked"
    else:
        tier = "verified"

    return {
        "tier": tier,
        "risk_score": raw_bot_probability,
        "raw_bot_probability": raw_bot_probability,
        "human_probability": human_probability,
        "human_logit": human_logit,
        "is_bot": is_bot,
        # OR-rule은 구성 모델마다 임계값이 달라 단일 threshold가 없다.
        "threshold": None,
        "human_threshold": None,
        "risk_score_threshold": None,
        "risk_score_temperature": None,
        "pointer_type": pointer_type,
        "component_scores": component_scores,
        "component_thresholds": component_thresholds,
        "triggered_models": triggered_models,
        "ensemble_method": "or_rule",
        "model_version": MODEL_VERSION,
        "error": error,
    }
