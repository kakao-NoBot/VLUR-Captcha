"""
Human/Function/GAN 공용 canonical [63,2] 텐서 (회전 정규화 포함) — 세 담당자 공유 모듈.

핵심 불변식 (SHARE 문서 §8.4):
    assert human_tensor.shape == function_tensor.shape == gan_tensor.shape
    assert human_tensor.coordinate_space == gan_tensor.coordinate_space
    assert no_source_metadata_in_model_input

공용 텐서 정의:
    shape (63,2), coordinate_space "normalized_displacement"
    = 63개의 "매 스텝 변위(delta)". cumsum하면 원점(0,0) 기준 절대 위치.

회전 정규화 (2026-07-21 추가, CNN 담당자 요청으로 우리가 구현·공유):
    각 궤적을 "종단 변위(net displacement)가 +x축을 향하도록" 회전한다. 소스(사람/함수/GAN)
    무관하게 궤적 자체의 종단만 보고 회전 각을 정하므로 모든 소스에 동일하게 적용된다.
    -> 이렇게 하면 "드래그 방향"이라는 소스 정보가 제거돼, 모델이 방향 분포로 소스를 구분하는
       누수(예: 회전 전 GAN V2 방향 std 102° vs 사람 23°)가 사라진다.
    → 반드시 사람·함수·GAN 세 소스 모두에 적용할 것. 한쪽만 회전하면 오히려 완벽한 소스
      분리(누수)가 된다. 그래서 GAN 로딩용 어댑터(iter_gan_v1/v2_canonical)도 여기서 함께 제공한다.
    → V2는 궤적뿐 아니라 waypoints_normalized / waypoint_tensor / target_normalized 도 같은
      각도로 회전해야 조건 좌표가 궤적과 어긋나지 않는다 (apply_endpoint_rotation이 처리).

미해결 주의 (원본 그대로 유지된 경고):
    V1 GAN은 스케일이 다르다(종단 크기 ~2.55 vs 사람 0.94). 회전은 방향만 맞추므로 V1 스케일
    편차는 별도 처리가 필요하다. 아래 NORMALIZE_ENDPOINT_SCALE 플래그 참고(기본 False → 합의
    전까지 스케일은 건드리지 않는다).

Human/Function 변환 절차:
    1. 원시 points(t,x,y)를 시간 진행률(0~1) 기준 64개 위치로 리샘플(64위치 → 63변위).
    2. 시작점 기준 상대좌표로 바꾸고 straightDist로 나눠 정규화.
    3. 연속 위치 차분(diff) → (63,2) 변위.
    4. 회전 정규화(종단 → +x).

라벨 규약:
    human/function -> "human"/"bot" (문자열). GAN 공용 어댑터의 label(정수 1)은 "스키마 통과"
    표시일 뿐 사람/봇 구분값이 아니므로, GAN 어댑터는 "bot"으로 통일해 내보낸다. 결국 세 소스
    모두 label ∈ {"human","bot"} 로 일관된다. 학습 target은 이 값(또는 소스)으로 정하면 된다.
"""
import numpy as np

CANONICAL_STEPS = 63  # GAN과 동일한 스텝 수
NORMALIZE_ENDPOINT_SCALE = True   # 종단 크기=1로 스케일 통일 → V1 GAN 스케일 편차(2.55배) 제거.
#   → 세 담당자(부스팅/CNN/BiLSTM)가 반드시 같은 값을 써야 비교가 유효함. 합의값 = True(2026-07-21).


# ---------------------------------------------------------------------------
# 회전 정규화 (소스 공용)
# ---------------------------------------------------------------------------
def _endpoint_rotation_matrix(trajectory):
    """종단 변위(net displacement)를 +x축으로 보내는 2x2 행렬 M. row-vector로 `coords @ M` 적용.

    종단이 거의 0(제자리 복귀)인 퇴화 궤적은 회전 값이 무의미하므로 항등행렬 반환.
    """
    ex, ey = np.asarray(trajectory, dtype=np.float64).sum(axis=0)
    norm = float(np.hypot(ex, ey))
    if norm < 1e-9:
        return np.eye(2, dtype=np.float32)
    cos, sin = ex / norm, ey / norm
    return np.array([[cos, -sin], [sin, cos]], dtype=np.float32)


def rotate_endpoint_to_x(trajectory):
    """(63,2) 변위 궤적을 종단이 +x를 향하도록 회전해 반환."""
    traj = np.asarray(trajectory, dtype=np.float32)
    return (traj @ _endpoint_rotation_matrix(traj)).astype(np.float32)


def apply_endpoint_rotation(out):
    """canonical dict(사람/함수 또는 GAN 어댑터 출력)에 동일 회전을 적용해 새 dict 반환.

    궤적의 종단 각도를 기준으로, 같은 공간에 있는 조건 좌표(waypoints_normalized,
    waypoint_tensor, target_normalized)까지 함께 회전한다. NORMALIZE_ENDPOINT_SCALE=True면
    종단 크기로 나눠 스케일도 통일한다(궤적·조건 좌표 모두 동일 스케일 적용).
    """
    traj = np.asarray(out["trajectory"], dtype=np.float32)
    M = _endpoint_rotation_matrix(traj)
    scale = 1.0
    if NORMALIZE_ENDPOINT_SCALE:
        norm = float(np.hypot(*traj.sum(axis=0)))
        scale = norm if norm > 1e-9 else 1.0

    result = dict(out)
    result["trajectory"] = ((traj @ M) / scale).astype(np.float32)
    for key in ("waypoints_normalized", "waypoint_tensor", "target_normalized"):
        if key in result and result[key] is not None:
            arr = np.asarray(result[key], dtype=np.float32)
            if arr.size:
                result[key] = ((arr @ M) / scale).astype(np.float32)
    return result


# ---------------------------------------------------------------------------
# Human / Function 변환
# ---------------------------------------------------------------------------
def _resample_positions(points, n_points):
    """원시 points를 시간 진행률 기준 n_points개 (x,y) 위치로 리샘플."""
    ts = np.array([p["t"] for p in points], dtype=np.float64)
    xs = np.array([p["x"] for p in points], dtype=np.float64)
    ys = np.array([p["y"] for p in points], dtype=np.float64)

    ts = np.maximum.accumulate(ts)  # coalesced 포인트 등으로 인한 비단조 방어
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


def human_or_function_to_canonical(record):
    """Human/Function 레코드 -> 회전 정규화된 (63,2) normalized-displacement canonical dict.

    V1(단순 드래그)은 GAN V1 어댑터와 동일하게 {trajectory, pointer_type, waypoint_count, label}만
    반환한다. V2(taskType=="waypoint_drag")는 GAN V2 어댑터와 동일하게 waypoints_normalized /
    waypoint_tensor / waypoint_mask / target_normalized 를 추가한다(같은 원점·스케일·회전).
    """
    points = record["points"]
    task = record["task"]
    straight_dist = max(task.get("straightDist", 1.0), 1e-6)

    rx, ry = _resample_positions(points, CANONICAL_STEPS + 1)  # 64개 위치 -> 63개 변위
    ox, oy = float(rx[0]), float(ry[0])                        # 궤적 원점 = 첫 점(웨이포인트도 동일 원점)
    dx = (rx - ox) / straight_dist
    dy = (ry - oy) / straight_dist
    positions = np.stack([dx, dy], axis=-1)  # (64,2), positions[0] == (0,0)
    trajectory = np.diff(positions, axis=0).astype(np.float32)  # (63,2)

    ptype = record["device"].get("pointerType", "")
    pointer_type = 0 if ptype == "mouse" else (1 if ptype == "touch" else 2)
    waypoint_count = int(task.get("waypointCount", 0))
    label = "human" if record["label"] == "human" else "bot"

    out = {
        "trajectory": trajectory,
        "pointer_type": pointer_type,
        "waypoint_count": waypoint_count,
        "label": label,
    }

    # V2 웨이포인트 드래그: 조건 좌표를 GAN V2 어댑터와 동일 스키마로 추출.
    if task.get("taskType") == "waypoint_drag":
        from ml.common.gan_supplement_waypoint_contract_fix1 import fixed_waypoint_tensor

        def _norm(pt):  # 궤적과 동일 원점·스케일 (회전은 apply_endpoint_rotation이 일괄 처리)
            return [(pt["x"] - ox) / straight_dist, (pt["y"] - oy) / straight_dist]

        wps = sorted(task.get("waypoints", []), key=lambda w: w.get("order", 0))
        wp_arr = np.asarray([_norm(w) for w in wps], dtype=np.float32).reshape(-1, 2)  # (count,2)
        tensor, mask, _ = fixed_waypoint_tensor(wp_arr, waypoint_count)  # (2,2)/(2,) 고정폭+마스크
        drop = task["dropCenter"]
        out["waypoints_normalized"] = wp_arr
        out["waypoint_tensor"] = tensor
        out["waypoint_mask"] = mask
        out["target_normalized"] = np.asarray(_norm(drop), dtype=np.float32)  # 과제 목표(dropCenter)

    return apply_endpoint_rotation(out)  # 회전(+스케일) 정규화 → trajectory·waypoint·target 일괄


# ---------------------------------------------------------------------------
# GAN 로딩 어댑터 — 공용 어댑터 출력에 동일 회전을 적용해 소스 무관 일관성 보장
# ---------------------------------------------------------------------------
def iter_gan_v1_canonical(path):
    """GAN V1 supplement -> 회전 정규화된 canonical dict 이터레이터 (label="bot"으로 통일)."""
    from ml.common.official_gan_adapters.official_load_gan_supplement_v1 import (
        iter_records, canonical_tensor,
    )
    for record in iter_records(path):
        out = apply_endpoint_rotation(canonical_tensor(record))
        out["label"] = "bot"
        yield out


def iter_gan_v2_canonical(path):
    """GAN V2 supplement -> 회전 정규화된 canonical dict 이터레이터 (label="bot"으로 통일).

    궤적과 함께 waypoints/target 좌표도 동일 각도로 회전됨(apply_endpoint_rotation).
    """
    from ml.common.official_gan_adapters.official_load_gan_supplement_v2_fix1 import (
        iter_records, canonical_tensor,
    )
    for record in iter_records(path):
        out = apply_endpoint_rotation(canonical_tensor(record))
        out["label"] = "bot"
        yield out


if __name__ == "__main__":
    import json

    r = json.load(open("dataset/human_clean.json"))[0]
    out = human_or_function_to_canonical(r)
    print("trajectory shape:", out["trajectory"].shape, "label:", out["label"])
    end = np.cumsum(out["trajectory"], axis=0)[-1]
    print("회전 후 종단:", end, "(y≈0 이어야 회전 정규화 정상)")
