"""
Threshold 정책(DIAGNOSIS_AND_ACTIONS.md §5) 구현.

정의 (팀 확정):
    Human FPR = 실제 사람인데 봇으로 오판되는 비율.
    TPR@FPR=X% = Human FPR을 X%로 맞췄을 때 봇을 잡아내는 비율(recall).

내부적으로는 "봇을 positive"로 뒤집어서 표준 ROC 정의(sklearn.roc_curve)에 그대로 태운다:
    bot_label = 1 - y   (y: 1=human, 0=bot — 우리 프로젝트 기존 컨벤션)
    bot_score = 1 - pred_prob_human
    then FPR(sklearn 표준) == 실제 사람이 봇으로 오판되는 비율 == "Human FPR"
    TPR(sklearn 표준) == 봇이 봇으로 맞게 잡히는 비율 == bot recall
"""
import hashlib
import json
import os

import numpy as np
from sklearn.metrics import roc_curve


def tpr_at_fpr(y, pred_prob_human, target_fpr):
    """Human FPR을 target_fpr로 맞췄을 때의 bot recall(TPR)을 ROC 커브에서 보간해 반환."""
    bot_label = 1 - y
    bot_score = 1 - pred_prob_human
    fpr, tpr, _ = roc_curve(bot_label, bot_score)
    return float(np.interp(target_fpr, fpr, tpr))


def find_threshold_for_human_fpr(human_val_pred_prob, target_fpr=0.005):
    """validation의 human 예측 확률 분포에서, Human FPR이 target_fpr이 되는 실제 결정 threshold를 찾는다.

    결정 규칙이 "prob_human >= threshold -> human"이므로, human 중 target_fpr 비율이
    threshold 밑으로 떨어지게(=봇으로 오판되게) target_fpr 분위수를 threshold로 잡는다.
    반드시 validation에서만 호출할 것(§5 규칙 2: test·레드팀으로 튜닝 금지).
    """
    return float(np.percentile(human_val_pred_prob, target_fpr * 100))


def operating_point_report(y, pred_prob_human, threshold):
    """threshold 고정 후 실제 confusion 기반 Human FPR / bot recall."""
    pred_label = (pred_prob_human >= threshold).astype(np.float32)
    human_mask = y == 1
    bot_mask = y == 0
    human_fpr = float(((pred_label[human_mask] == 0)).sum() / max(human_mask.sum(), 1))
    bot_recall = float(((pred_label[bot_mask] == 0)).sum() / max(bot_mask.sum(), 1))
    return human_fpr, bot_recall


def calibration_sidecar_path(checkpoint_path: str) -> str:
    """모델 체크포인트(.keras) 경로 옆에 나란히 둘 calibration sidecar 파일 경로."""
    base, _ = os.path.splitext(checkpoint_path)
    return base + ".calibration.json"


def save_calibration(checkpoint_path: str, temperature: float, threshold: float, extra: dict = None):
    """temperature·threshold를 체크포인트와 한 묶음(sidecar json)으로 저장.

    배경(팀 리뷰 1차): "같은 전처리·구조인데 checkpoint마다 threshold가 0.82~0.99까지 다르다.
    모델 교체 시 threshold를 공유하면 안 되고, checkpoint별 독립 calibration이 필요하다."
    배경(팀 리뷰 2차): "threshold만 보이고 checkpoint/sidecar SHA, 전처리 hash, binding 결과가
    없어 강제 결합 확인 불가" — 그래서 체크포인트 파일 자체의 sha256을 sidecar에 같이
    적어서, 이 threshold가 정확히 어느 가중치 파일에 대해 계산된 건지 검증 가능하게 한다.
    이 함수를 안 쓰고 threshold 숫자를 코드에 하드코딩하거나 다른 체크포인트 것을 재사용하면
    바로 이 문제가 재발한다 — 항상 이 함수로 저장하고 load_calibration()으로만 불러올 것.
    """
    checkpoint_sha256 = None
    if os.path.exists(checkpoint_path):
        h = hashlib.sha256()
        with open(checkpoint_path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        checkpoint_sha256 = h.hexdigest()

    payload = {
        "temperature": float(temperature),
        "threshold": float(threshold),
        "checkpoint_path": os.path.abspath(checkpoint_path),
        "checkpoint_sha256": checkpoint_sha256,
    }
    if extra:
        payload.update(extra)
    path = calibration_sidecar_path(checkpoint_path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    return path


def verify_calibration_binding(checkpoint_path: str) -> bool:
    """sidecar에 적힌 checkpoint_sha256이 실제 체크포인트 파일과 일치하는지 확인.

    True가 아니면 이 threshold를 그 체크포인트에 쓰면 안 됨(파일이 재학습·교체됐는데
    sidecar가 안 갱신된 경우 등).
    """
    calib = load_calibration(checkpoint_path)
    recorded = calib.get("checkpoint_sha256")
    if recorded is None or not os.path.exists(checkpoint_path):
        return False
    h = hashlib.sha256()
    with open(checkpoint_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest() == recorded


def load_calibration(checkpoint_path: str) -> dict:
    """save_calibration()으로 저장된 sidecar를 불러온다. 없으면 명확히 에러(조용히 0.5 쓰지 않음)."""
    path = calibration_sidecar_path(checkpoint_path)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"{path} 없음 — 이 체크포인트({checkpoint_path})는 calibration 없이 저장된 것 같음. "
            "다른 체크포인트의 threshold를 재사용하지 말고, 이 체크포인트로 validation에서 "
            "다시 calibration할 것."
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
