"""CNN scalar(cond) 확장 — 4차원 → 19차원.

BiLSTM `prepare_bilstm_data.py::geom_features()`를 **그대로** 이식한다(수식 무변경).
아키텍처는 건드리지 않는다 — Conv1D 본체는 그대로고 scalar_branch의 입력 차원만 늘어난다.

새 레이아웃 (앞 4개는 반드시 유지)
    [0]    waypoint_count (raw)          ← 기존
    [1:4]  pointer one-hot (mouse/touch/pen) ← 기존. model._apply_pointer_norm()과
                                             decide()가 이 인덱스를 하드코딩하므로 이동 금지
    [4:7]  waypointCount one-hot (0/1/2)  ← 신규
    [7:19] geom 12차원                    ← 신규

⚠ sigma(Sigma-Lognormal 4차원)는 제외했다. 적합에 건당 ~344ms가 걸려 전체 20만 건에
  약 19시간이 필요하다(이 환경 불가). GPU/서버에서는 `ml/bilstm/sigma_lognormal.py`를
  같은 방식으로 붙이면 된다 — 그때 scalar는 23차원이 되고 아래 GEOM 블록 뒤에 붙이면 된다.
"""
import argparse
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "common"))
sys.path.insert(0, os.path.dirname(HERE))

GEOM_EPS = 1e-8
GEOM_TREMOR_RAD = 0.15


def geom_features(disp, wc):
    """BiLSTM geom_features()와 동일 (canonical (63,2) 변위 + waypoint_count만 사용)."""
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


def extend(path_in, path_out):
    d = np.load(path_in, allow_pickle=True)
    seq, scalar = d["seq"], d["scalar"]
    wp = d["waypoint_count"] if "waypoint_count" in d.files else scalar[:, 0].astype(int)
    n = len(seq)
    out = np.zeros((n, 19), dtype=np.float32)
    out[:, :4] = scalar[:, :4]                      # 기존 4차원 그대로 (인덱스 고정)
    for k in range(3):                              # waypointCount one-hot
        out[:, 4 + k] = (wp == k).astype(np.float32)
    for i in range(n):
        out[i, 7:] = geom_features(seq[i][:, 2:4], int(wp[i]))
    kw = {k: d[k] for k in d.files if k != "scalar"}
    kw["scalar"] = out
    np.savez_compressed(path_out, **kw)
    print(f"[완료] {os.path.basename(path_in)} n={n} scalar {scalar.shape[1]} -> 19")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="+", required=True)
    ap.add_argument("--workdir", default=os.path.join(os.path.dirname(HERE), "work"))
    args = ap.parse_args()
    for f in args.files:
        extend(os.path.join(args.workdir, f), os.path.join(args.workdir, f.replace(".npz", "_x19.npz")))


if __name__ == "__main__":
    main()
