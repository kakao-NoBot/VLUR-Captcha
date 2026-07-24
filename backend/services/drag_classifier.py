# drag_classifier.py
# 실제 학습된 CNN 드래그 봇 판별 모델(ml/cnn) 서빙 래퍼.
# 체크포인트는 모듈 로드 시 1회만 읽는다 — 요청마다 재로딩하면 느리다.

import json
import math
from pathlib import Path

import torch

from ml.cnn.cnn_canonical_features import human_or_function_record_to_cnn
from ml.cnn.model_cnn_torch import build_model

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
# 모델 자체 임계값과의 거리가 이 이내면 "애매함"으로 보고 유형2 재검증.
# 주의: 이 체크포인트는 fpr_target=0.005로 캘리브레이션돼 threshold(사람 기준)가 0.95 근처의
# 극단값이라, 사람이 낼 수 있는 최댓값(1.0)까지 여유가 0.05 정도밖에 없다. 예전 BiLSTM용
# 마진(0.10)을 그대로 쓰면 그 여유 전체가 "애매함"에 먹혀 사람이 절대 확실한 통과(verified)에
# 도달하지 못하는 문제가 생긴다(2026-07-24 실사용 테스트에서 확인) — threshold 위치에 맞게 축소.
AMBIGUOUS_MARGIN = 0.03

_ckpts = sorted(MODEL_DIR.glob("*.pt"))
if not _ckpts:
    raise RuntimeError(f"{MODEL_DIR}에 .pt 체크포인트가 없습니다.")
_ckpt_path = _ckpts[0]
MODEL_VERSION = _ckpt_path.stem

_calib_path = Path(str(_ckpt_path).rsplit(".pt", 1)[0] + ".calibration.json")
if not _calib_path.exists():
    raise RuntimeError(f"{_calib_path} calibration 파일이 없습니다.")
_calibration = json.loads(_calib_path.read_text(encoding="utf-8"))
if _calibration.get("score_direction") != "higher_score_means_human":
    raise RuntimeError(
        f"{_calib_path}의 score_direction이 예상과 다릅니다: {_calibration.get('score_direction')!r}"
    )
_HUMAN_THRESHOLD = float(_calibration["threshold"])

_state_dict = torch.load(str(_ckpt_path), map_location="cpu")
# domain_adversarial로 학습된 체크포인트는 domain_head.*.bias 가중치를 갖고 있고,
# n_domains를 안 맞춰서 build_model()하면 그 가중치를 못 싣고 load_state_dict가 에러남 →
# 체크포인트 자체에서 domain_head 최종 레이어의 출력 차원을 읽어 자동으로 맞춘다.
_domain_bias_keys = sorted(k for k in _state_dict if k.startswith("domain_head.") and k.endswith(".bias"))
_n_domains = _state_dict[_domain_bias_keys[-1]].shape[0] if _domain_bias_keys else None

_model = build_model(seq_channels=8, n_scalar=4, dropout=0.3, n_domains=_n_domains)
_model.load_state_dict(_state_dict)
_model.eval()


def build_record(drag_trace, pointer_type, waypoints, start_center, drop_center) -> dict:
    """프론트에서 받은 드래그 텔레메트리를 canonical 변환기가 기대하는 record 스키마로 변환.

    "label"은 실제 추론 수식(trajectory·pointer_type·waypoint_count만 사용)에는 전혀
    쓰이지 않지만, human_or_function_to_canonical()이 record["label"]을 무조건 직접
    인덱싱하기 때문에 없으면 KeyError로 요청 자체가 실패한다. 그래서 항상 채워주는
    더미 값이다(값 자체는 무의미).
    """
    straight_dist = math.hypot(
        drop_center["x"] - start_center["x"],
        drop_center["y"] - start_center["y"],
    )
    return {
        "points": [{"t": s["t"], "x": s["x"], "y": s["y"]} for s in drag_trace],
        "device": {"pointerType": pointer_type or "mouse"},
        "task": {
            "taskType": "waypoint_drag",
            "waypointCount": len(waypoints),
            "waypoints": [{"x": w["x"], "y": w["y"], "order": i} for i, w in enumerate(waypoints)],
            "startCenter": start_center,
            "dropCenter": drop_center,
            "straightDist": max(straight_dist, 1e-6),
        },
        "label": "human",
    }


@torch.no_grad()
def _predict_human_probability(record: dict) -> float:
    seq, scalar, _ = human_or_function_record_to_cnn(record)
    seq_t = torch.from_numpy(seq).float().unsqueeze(0)
    scalar_t = torch.from_numpy(scalar).float().unsqueeze(0)
    logit = _model(seq_t, scalar_t)  # grl_lambda 안 줌 -> domain_head 있어도 무시됨(정상)
    return torch.sigmoid(logit).item()


def classify(record: dict) -> dict:
    """모델 판정 결과를 challenge/verify 라우터가 쓰는 3단계(tier)로 매핑.

    체크포인트의 calibration.json은 "높을수록 사람"(human_prob) 기준으로 threshold가
    잡혀 있다. DB bot_score 컬럼·관리자 UI는 반대로 "높을수록 봇"을 가정하므로,
    여기서 bot_probability = 1 - human_prob 로 뒤집어 기존 스키마와 맞춘다.
    """
    try:
        human_prob = _predict_human_probability(record)
        error = None
    except (KeyError, ValueError, IndexError) as exc:
        # fail-closed: 입력이 기형이면 무조건 봇으로 처리
        human_prob = 0.0
        error = str(exc)

    is_bot = human_prob < _HUMAN_THRESHOLD
    ambiguous = abs(human_prob - _HUMAN_THRESHOLD) < AMBIGUOUS_MARGIN
    bot_probability = 1.0 - human_prob

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
        "bot_probability": bot_probability,
        "is_bot": is_bot,
        "threshold": 1.0 - _HUMAN_THRESHOLD,
        "model_version": MODEL_VERSION,
        "error": error,
    }
