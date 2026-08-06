"""Ultra_CNN_v2 입력 피처 재구성 (팀 공용 canonical_tensor.py 로직을 numpy로 재현).

의존성 없음(torch 불필요) — Conv1d 순전파를 직접 구현한 cnn_np_forward.py와 짝을 이룬다.
Human/Function(points 원본)과 GAN(이미 정규화된 trajectory)을 각각 처리하는 함수를 제공한다.

검증: 소규모 샘플에서 이 파이프라인으로 계산한 threshold가 체크포인트 내장값
(mouse 0.3713 / touch 0.8756 / pen 0.6352 / global 0.5781)과 정확히 일치함을 확인했고,
bot_kinematic_lognormal_v2.json(10,000건)에서 우회율 51.88%를 얻어 Ultra_CNN_v2 팀
자체 리포트가 3-seed 편차로 보고한 범위([51.2~80.8%])의 하한과 거의 정확히 일치함을 확인했다.
"""
import numpy as np

CANONICAL_STEPS = 63
GEOM_EPS = 1e-8
GEOM_TREMOR_RAD = 0.15


# ---------------------------------------------------------------------------
# Human / Function (raw points -> canonical trajectory)
# ---------------------------------------------------------------------------

def _resample_positions(points, n_points):
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


def _endpoint_rotation_matrix(trajectory):
    ex, ey = np.asarray(trajectory, dtype=np.float64).sum(axis=0)
    norm = float(np.hypot(ex, ey))
    if norm < 1e-9:
        return np.eye(2, dtype=np.float32)
    cos, sin = ex / norm, ey / norm
    return np.array([[cos, -sin], [sin, cos]], dtype=np.float32)


def human_or_function_to_canonical_trajectory(record):
    """raw 수집형 record(points/task/device) -> (traj(63,2), pointer_type, waypoint_count, label)."""
    points = record["points"]
    task = record["task"]
    straight_dist = max(task.get("straightDist", 1.0), 1e-6)
    rx, ry = _resample_positions(points, CANONICAL_STEPS + 1)
    ox, oy = float(rx[0]), float(ry[0])
    dx = (rx - ox) / straight_dist
    dy = (ry - oy) / straight_dist
    positions = np.stack([dx, dy], axis=-1)
    trajectory = np.diff(positions, axis=0).astype(np.float32)
    M = _endpoint_rotation_matrix(trajectory)
    norm = float(np.hypot(*trajectory.sum(axis=0)))
    scale = norm if norm > 1e-9 else 1.0
    trajectory = ((trajectory @ M) / scale).astype(np.float32)
    ptype = record["device"].get("pointerType", "")
    pointer_type = 0 if ptype == "mouse" else (1 if ptype == "touch" else 2)
    waypoint_count = int(task.get("waypointCount", 0))
    label = "human" if record["label"] == "human" else "bot"
    return trajectory, pointer_type, waypoint_count, label


def gan_record_to_canonical_trajectory(record):
    """GAN v2 jsonl record(이미 정규화된 trajectory) -> (traj(63,2), pointer_type, waypoint_count)."""
    traj = np.asarray(record["trajectory"], dtype=np.float32)
    M = _endpoint_rotation_matrix(traj)
    norm = float(np.hypot(*traj.sum(axis=0)))
    scale = norm if norm > 1e-9 else 1.0
    rotated = ((traj @ M) / scale).astype(np.float32)
    ptype = 0 if record["pointer_type"] == "mouse" else 1
    wc = int(record["waypoint_count"])
    return rotated, ptype, wc


# ---------------------------------------------------------------------------
# trajectory(63,2) -> CNN 시퀀스 (63,8)
# ---------------------------------------------------------------------------

def canonical_to_cnn_sequence(trajectory):
    vx, vy = trajectory[:, 0], trajectory[:, 1]
    dx = np.cumsum(vx)
    dy = np.cumsum(vy)
    speed = np.sqrt(vx**2 + vy**2)
    ax = np.diff(vx, prepend=vx[0])
    ay = np.diff(vy, prepend=vy[0])
    accel_mag = np.sqrt(ax**2 + ay**2)
    jx = np.diff(ax, prepend=ax[0])
    jy = np.diff(ay, prepend=ay[0])
    jerk_mag = np.sqrt(jx**2 + jy**2)
    angles = np.arctan2(vy, vx)
    delta_angle = np.diff(angles, prepend=angles[0])
    delta_angle = (delta_angle + np.pi) % (2 * np.pi) - np.pi
    turn_angle = np.abs(delta_angle)
    return np.stack([dx, dy, vx, vy, speed, accel_mag, jerk_mag, turn_angle], axis=-1).astype(np.float32)


# ---------------------------------------------------------------------------
# scalar 19차원: [wc, pointer_onehot(3), wc_onehot(3), geom12]
# (ml/extend_scalar.py::geom_features()를 수식 그대로 이식)
# ---------------------------------------------------------------------------

def geom_features(disp, wc):
    pos = np.cumsum(disp, axis=0)
    speed = np.linalg.norm(disp, axis=1).astype(np.float32)
    path_len = float(speed.sum()) + GEOM_EPS
    endpoint = float(np.linalg.norm(pos[-1]))
    straightness = endpoint / path_len
    path_len_s = min(path_len / 2.0, 3.0)
    step_cv = float(speed.std() / (speed.mean() + GEOM_EPS))
    peak_pos = float(np.argmax(speed)) / (len(speed) - 1)
    sp_std = speed.std() + GEOM_EPS
    skew = float(((speed - speed.mean()) ** 3).mean() / sp_std ** 3)
    skew_s = float(np.clip(skew / 3.0, -3, 3))
    sm = np.convolve(speed, np.ones(3, np.float32) / 3, mode="same")
    n_peaks = int(((sm[1:-1] > sm[:-2]) & (sm[1:-1] > sm[2:])).sum())
    n_peaks_s = min(n_peaks / 5.0, 3.0)
    turn = np.zeros(len(disp), np.float32)
    dot = (disp[:-1] * disp[1:]).sum(1)
    cross = disp[:-1, 0] * disp[1:, 1] - disp[:-1, 1] * disp[1:, 0]
    turn[1:] = np.arctan2(cross, dot)
    at = np.abs(turn)
    curv_mean = float(at.mean()) / np.pi
    curv_std = float(at.std()) / np.pi
    curv_max = float(at.max()) / np.pi
    sig = np.sign(turn)
    reversals = int(((sig[1:] * sig[:-1] < 0) & (at[1:] > GEOM_TREMOR_RAD)).sum())
    reversals_s = min(reversals / 10.0, 3.0)
    decel_s, seg_consistency = 0.0, 0.0
    if wc >= 1 and len(speed) >= 9:
        k = int(np.clip(np.argmax(at), 4, len(speed) - 5))
        before = float(speed[k - 4:k].mean())
        after = float(speed[k:k + 4].mean())
        decel_s = float(np.clip((before + GEOM_EPS) / (after + GEOM_EPS) / 2.0, 0, 3))
    if wc >= 1 and len(pos) >= (wc + 1) * 3:
        cuts = sorted(int(i) for i in np.argsort(at)[-wc:])
        bounds = [0] + cuts + [len(pos) - 1]
        seg_str = []
        for a, b in zip(bounds[:-1], bounds[1:]):
            if b - a >= 2:
                seg_len = float(speed[a + 1:b + 1].sum()) + GEOM_EPS
                seg_str.append(float(np.linalg.norm(pos[b] - pos[a]) / seg_len))
        if len(seg_str) >= 2:
            seg_consistency = float(np.std(seg_str))
    return np.array([straightness, path_len_s, step_cv, peak_pos, skew_s, n_peaks_s,
                     curv_mean, curv_std, curv_max, reversals_s, decel_s, seg_consistency],
                    dtype=np.float32)


def scalar19_from_seq(seq, pointer_type, waypoint_count):
    disp = seq[:, 2:4]  # vx, vy
    onehot = [1.0 if pointer_type == p else 0.0 for p in (0, 1, 2)]
    wc = int(waypoint_count)
    wc_onehot = [1.0 if wc == k else 0.0 for k in range(3)]
    geom = geom_features(disp, wc)
    return np.concatenate([[float(wc)], onehot, wc_onehot, geom]).astype(np.float32)


def record_to_cnn_inputs(record):
    """레코드(human/function raw 또는 GAN v2 jsonl) -> (seq(63,8), scalar19(19,))."""
    if "trajectory" in record:  # GAN v2
        traj, ptype, wc = gan_record_to_canonical_trajectory(record)
    else:  # human/function
        traj, ptype, wc, _label = human_or_function_to_canonical_trajectory(record)
    seq = canonical_to_cnn_sequence(traj)
    scalar = scalar19_from_seq(seq, ptype, wc)
    return seq, scalar
