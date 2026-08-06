# drag_classifier.py
# 실제 학습된 CNN 드래그 봇 판별 모델(ml/cnn) 서빙 래퍼.
# 체크포인트는 모듈 로드 시 1회만 읽는다 — 요청마다 재로딩하면 느리다.

import hashlib
import json
import os
import sys
from pathlib import Path

import torch

# AI 패키지를 저장소 루트에서 import해도 기존 ml.* 절대 import가 동작하도록 한다.
AI_ROOT = Path(__file__).resolve().parent.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from ml.cnn.cnn_canonical_features import human_or_function_record_to_cnn
from ml.cnn.model_cnn_torch import build_model
from AI.services.risk_score import (
    DEFAULT_RISK_TEMPERATURE,
    calibrated_risk_score,
    stable_sigmoid,
)

MODEL_DIR = AI_ROOT / "model"
# 모델 자체 임계값과의 거리가 이 이내면 "애매함"으로 보고 유형2 재검증.
# 주의: 이 체크포인트는 fpr_target=0.005로 캘리브레이션돼 threshold(사람 기준)가 0.95 근처의
# 극단값이라, 사람이 낼 수 있는 최댓값(1.0)까지 여유가 0.05 정도밖에 없다. 예전 BiLSTM용
# 마진(0.10)을 그대로 쓰면 그 여유 전체가 "애매함"에 먹혀 사람이 절대 확실한 통과(verified)에
# 도달하지 못하는 문제가 생긴다(2026-07-24 실사용 테스트에서 확인) — threshold 위치에 맞게 축소.
AMBIGUOUS_MARGIN = 0.03

DEFAULT_MODEL_NAME = (
    "v2_torch_random_da0.05_ls0.01_trsmoothwp_touchheavy_ptrbal_"
    "bakedptrnorm_pptthr_hardneg_best.pt"
)
DEFAULT_MODEL_VERSION = "drag-cnn-v2-final"
MODEL_VERSION_MAX_LENGTH = 128
_ckpt_path = Path(os.getenv("MODEL_PATH", str(MODEL_DIR / DEFAULT_MODEL_NAME)))
if not _ckpt_path.is_file():
    raise RuntimeError(f"지정된 모델 체크포인트가 없습니다: {_ckpt_path}")

# 체크포인트 파일명은 학습 설정을 모두 포함해 길 수 있으므로 DB/화면에 노출하는 안정적인
# 버전 식별자와 분리한다. MODEL_PATH를 바꿔도 버전은 배포 설정에서 명시적으로 관리한다.
MODEL_VERSION = os.getenv("MODEL_VERSION", DEFAULT_MODEL_VERSION).strip()
if not MODEL_VERSION:
    raise RuntimeError("MODEL_VERSION은 빈 문자열일 수 없습니다.")
if len(MODEL_VERSION) > MODEL_VERSION_MAX_LENGTH:
    raise RuntimeError(
        f"MODEL_VERSION은 {MODEL_VERSION_MAX_LENGTH}자 이하여야 합니다: {MODEL_VERSION!r}"
    )

_calib_path = Path(str(_ckpt_path).rsplit(".pt", 1)[0] + ".calibration.json")
if not _calib_path.exists():
    raise RuntimeError(f"{_calib_path} calibration 파일이 없습니다.")
_calibration = json.loads(_calib_path.read_text(encoding="utf-8"))
_expected_sha256 = _calibration.get("checkpoint_sha256")
if _expected_sha256:
    _actual_sha256 = hashlib.sha256(_ckpt_path.read_bytes()).hexdigest()
    if _actual_sha256 != _expected_sha256:
        raise RuntimeError(
            f"모델과 calibration 파일의 SHA-256이 일치하지 않습니다: {_ckpt_path}"
        )
if _calibration.get("score_direction") != "higher_score_means_human":
    raise RuntimeError(
        f"{_calib_path}의 score_direction이 예상과 다릅니다: {_calibration.get('score_direction')!r}"
    )
_HUMAN_THRESHOLD = float(_calibration["threshold"])
# 관리자용 위험 지수의 초기 표시 스케일. 보안 판정 임계값에는 영향을 주지 않는다.
# 향후 라벨이 있는 검증 로짓이 확보되면 calibration.json에 이 값만 재학습해 넣으면 된다.
_RISK_SCORE_TEMPERATURE = float(
    _calibration.get("risk_score_temperature", DEFAULT_RISK_TEMPERATURE)
)

_state_dict = torch.load(str(_ckpt_path), map_location="cpu", weights_only=True)
# domain_adversarial로 학습된 체크포인트는 domain_head.*.bias 가중치를 갖고 있고,
# n_domains를 안 맞춰서 build_model()하면 그 가중치를 못 싣고 load_state_dict가 에러남 →
# 체크포인트 자체에서 domain_head 최종 레이어의 출력 차원을 읽어 자동으로 맞춘다.
_domain_bias_keys = sorted(k for k in _state_dict if k.startswith("domain_head.") and k.endswith(".bias"))
_n_domains = _state_dict[_domain_bias_keys[-1]].shape[0] if _domain_bias_keys else None

_model = build_model(seq_channels=8, n_scalar=4, dropout=0.3, n_domains=_n_domains)
# 최종 체크포인트에는 가중치와 함께 전처리/임계값 메타데이터가 저장되어 있다. 모델
# 레이어에 해당하는 키만 엄격하게 로드해 메타데이터를 unexpected key로 오인하지 않는다.
_model_keys = set(_model.state_dict())
_model_state_dict = {key: value for key, value in _state_dict.items() if key in _model_keys}
_model.load_state_dict(_model_state_dict, strict=True)
_model.eval()


@torch.no_grad()
def _predict_human_logit(record: dict) -> float:
    seq, scalar, _ = human_or_function_record_to_cnn(record)
    seq_t = torch.from_numpy(seq).float().unsqueeze(0)
    scalar_t = torch.from_numpy(scalar).float().unsqueeze(0)
    logit = _model(seq_t, scalar_t)  # grl_lambda 안 줌 -> domain_head 있어도 무시됨(정상)
    return logit.item()


def classify(record: dict) -> dict:
    """모델 판정 결과를 challenge/verify 라우터가 쓰는 3단계(tier)로 매핑.

    체크포인트의 calibration.json은 "높을수록 사람"(human_prob) 기준으로 threshold가
    잡혀 있다. 보안 판정은 이 원본 확률을 그대로 사용하고, DB bot_score·관리자 UI에는
    임계 로짓을 50점으로 고정한 완만한 위험 지수를 별도로 저장한다.
    """
    try:
        human_logit = _predict_human_logit(record)
        human_prob = stable_sigmoid(human_logit)
        raw_bot_probability = stable_sigmoid(-human_logit)
        risk_score = calibrated_risk_score(
            human_logit,
            _HUMAN_THRESHOLD,
            _RISK_SCORE_TEMPERATURE,
        )
        error = None
    except (KeyError, ValueError, IndexError) as exc:
        # fail-closed: 입력이 기형이면 무조건 봇으로 처리
        # JSON 응답에 NaN/Infinity를 넣을 수 없으므로 충분히 작은 유한값을 사용한다.
        human_logit = -100.0
        human_prob = 0.0
        raw_bot_probability = 1.0
        risk_score = 1.0
        error = str(exc)

    is_bot = human_prob < _HUMAN_THRESHOLD
    ambiguous = abs(human_prob - _HUMAN_THRESHOLD) < AMBIGUOUS_MARGIN

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
        "risk_score": risk_score,
        "raw_bot_probability": raw_bot_probability,
        "human_probability": human_prob,
        "human_logit": human_logit,
        "is_bot": is_bot,
        "threshold": 1.0 - _HUMAN_THRESHOLD,
        "risk_score_threshold": 0.5,
        "risk_score_temperature": _RISK_SCORE_TEMPERATURE,
        "model_version": MODEL_VERSION,
        "error": error,
    }
