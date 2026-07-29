"""
"B: contract-correct" 전처리 — 팀이 확정한 V1 GAN 원본 계약을 그대로 따른다.

계약(팀 확정):
    - 이미 normalized displacement (p_norm=(point-startCenter)/straightDist, d_norm=diff(p_norm))
    - rotation = false
    - endpoint 강제 rescale = false
    - 분모는 record별 task.straightDist

지금까지 모든 실험(train_common.py 등)은 canonical_tensor.py의 apply_endpoint_rotation()을
거쳐서 회전 + 끝점 크기=1 강제를 **추가로** 적용한 "A: legacy preprocessing"이었다. 이게
Human/Function/GAN/Diffusion 전부에 균일하게 적용되는 추가 모델 변환이라 새로운 소스 간
leakage는 아니지만, "팀이 전달한 canonical representation 그대로"는 아니다 — A/B를 비교해야
diffusion recall이 낮은 이유가 "생성 방식 자체" 때문인지 "우리가 얹은 추가 정규화" 때문인지
갈린다.

이 모듈은 canonical_tensor.py를 수정하지 않고(팀 공유 파일이라 함부로 안 건드림) 그 옆에
회전·스케일 없는 버전을 별도로 구현한다:
    - Human/Function/Diffusion: 위치를 시작점 기준으로 옮기고 straightDist로 나눈 뒤 diff만
      취함 (canonical_tensor.py의 human_or_function_to_canonical()과 동일한 앞부분, 마지막의
      apply_endpoint_rotation() 호출만 뺌).
    - GAN: 공식 어댑터(official_load_gan_supplement_v{1,2}.py)의 canonical_tensor()를
      **회전 래퍼 없이 직접** 호출 — 이게 정확히 "팀이 전달한 그대로"다(원본 그 자체가
      이미 rotation=false, endpoint_rescale=false 계약으로 옴).
"""
import numpy as np

from ml.common.official_gan_adapters.official_load_gan_supplement_v1 import (
    canonical_tensor as _v1_canonical_tensor,
    iter_records as _v1_iter_records,
)
from ml.common.official_gan_adapters.official_load_gan_supplement_v2_fix1 import (
    canonical_tensor as _v2_canonical_tensor,
    iter_records as _v2_iter_records,
)


def _resample_positions(points, n_points):
    """canonical_tensor.py의 _resample_positions()와 동일한 로직(비교 공정성 위해 그대로 복제)."""
    ts = np.array([p["t"] for p in points], dtype=np.float64)
    xs = np.array([p["x"] for p in points], dtype=np.float64)
    ys = np.array([p["y"] for p in points], dtype=np.float64)

    ts = np.maximum.accumulate(ts)
    duration = ts[-1] - ts[0]
    progress = (ts - ts[0]) / duration if duration > 0 else np.linspace(0, 1, len(ts))
    progress, idx = np.unique(progress, return_index=True)
    xs, ys = xs[idx], ys[idx]

    target_progress = np.linspace(0, 1, n_points)
    if len(progress) < 2:
        rx = np.full(n_points, xs[0] if len(xs) else 0.0)
        ry = np.full(n_points, ys[0] if len(ys) else 0.0)
    else:
        rx = np.interp(target_progress, progress, xs)
        ry = np.interp(target_progress, progress, ys)
    return rx, ry


def human_or_function_to_contract_correct(record):
    """Human/Function/Diffusion raw record -> (63,2) trajectory, 회전/스케일 강제 없음.

    canonical_tensor.py의 human_or_function_to_canonical()과 앞부분(위치 정규화)은 완전히
    동일하고, 마지막 apply_endpoint_rotation() 호출만 뺐다 — 그래서 GAN의 "이미 정규화된
    displacement, rotation=false" 계약과 같은 기준이 된다.
    """
    points = record["points"]
    task = record["task"]
    straight_dist = max(task.get("straightDist", 1.0), 1e-6)

    rx, ry = _resample_positions(points, 64)
    ox, oy = float(rx[0]), float(ry[0])
    dx = (rx - ox) / straight_dist
    dy = (ry - oy) / straight_dist
    positions = np.stack([dx, dy], axis=-1)
    trajectory = np.diff(positions, axis=0).astype(np.float32)  # (63,2), 회전 없음

    ptype = record["device"].get("pointerType", "")
    pointer_type = 0 if ptype == "mouse" else (1 if ptype == "touch" else 2)
    waypoint_count = int(task.get("waypointCount", 0))
    label = "human" if record["label"] == "human" else "bot"

    return {
        "trajectory": trajectory,
        "pointer_type": pointer_type,
        "waypoint_count": waypoint_count,
        "label": label,
    }


def iter_gan_v1_contract_correct(path):
    """GAN V1 jsonl -> 공식 어댑터 canonical_tensor()를 회전 래퍼 없이 그대로 사용 (label='bot' 통일)."""
    for record in _v1_iter_records(path):
        out = _v1_canonical_tensor(record)  # 회전/스케일 강제 안 함 — 원본 계약 그대로
        out = dict(out)
        out["label"] = "bot"
        yield out


def iter_gan_v2_contract_correct(path):
    """GAN V2 jsonl -> (canonical dict, split) 튜플. 공식 어댑터가 split을 안 돌려줘서
    (V1과 비대칭 — 공식 어댑터 자체의 특성) raw record에서 따로 읽어 같이 내보낸다.
    """
    for record in _v2_iter_records(path):
        out = _v2_canonical_tensor(record)
        out = dict(out)
        out["label"] = "bot"
        yield out, record["split"]
