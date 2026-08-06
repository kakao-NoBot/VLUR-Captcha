"""BiLSTM predictor — BiLSTM 담당이 준 정확 스펙(`ml/bilstm/model.py`, `prepare_bilstm_data.py`
기준, message-37f46270.txt)대로 확정. TODO 다 해결됨.

확정된 것(전부 BiLSTM 담당 원본 코드 기준, 짐작 아님):
    - 시퀀스 10채널: [x,y,dx,dy,speed,ax,ay,accel_mag,jerk_mag,turn(signed)] — CNN의 8채널과
      다르다(특히 turn은 signed, CNN은 unsigned abs). §1
    - 시퀀스는 LSTM에 넣기 전 **체크포인트에 저장된 채널별 mu/sd로 표준화**해야 한다
      ((seq-mu)/sd). **cond는 표준화 안 함.** 이게 처음 버전에서 빠져 있던 버그였다.
    - cond 22차원 순서: `[pointer3, wc_onehot3, sigma4, geom12]` — **sigma가 geom보다 앞**
      (처음에 geom을 앞에 뒀던 게 틀림).
    - BiLSTM cond ≠ CNN의 scalar19. scalar19_from_seq()는 CNN 전용이고 맨 앞에 raw wc_scalar가
      있다 — BiLSTM cond엔 그게 없다. 절대 재사용하지 말 것(혼동 주의).
    - LSTM 출력 요약 = final_hidden(마지막 layer 정·역방향 concat) — 처음 기본값 추측이 맞았음.
    - 게이트 순서 [i,f,g,o] — bilstm_np_forward.py가 이미 이 순서로 구현돼 있어 그대로 둠.
    - head: Linear(278,64) -> ReLU -> Dropout(추론 no-op) -> Linear(64,1) -> sigmoid = bot_prob.
"""
import numpy as np

from .bilstm_np_forward import bilstm_forward
from .sigma_lognormal import sigma_features


def _canonical_trajectory(record):
    """human_or_function_to_canonical_trajectory와 동일한 (63,2) 변위 traj를 반환한다.
    canonical_features.py의 함수를 그대로 쓴다 — 여기서 나온 traj가 CNN·BiLSTM 공용
    canonical_tensor.py의 결과물이라 두 모델이 같은 traj에서 출발하는 건 맞다(입력 traj는
    공용, 그 이후 파생 채널 구성만 CNN/BiLSTM이 다르다)."""
    from .canonical_features import human_or_function_to_canonical_trajectory
    traj, ptype, wc, _label = human_or_function_to_canonical_trajectory(record)
    return traj, ptype, wc


def seq10_from_trajectory(traj):
    """traj: (63,2) canonical 변위. 반환: (63,10) — BiLSTM 담당 스펙 §1 그대로.
    [x,y,dx,dy,speed,ax,ay,accel_mag,jerk_mag,turn(signed)]. CNN의 canonical_to_cnn_sequence와
    앞 5채널(x,y,dx,dy,speed)은 같지만, 그 뒤로는 다르다 — ax/ay를 따로 채널로 갖고, turn은
    signed(부호 있음, CNN은 unsigned abs)."""
    pos = np.cumsum(traj, axis=0)
    x, y = pos[:, 0], pos[:, 1]
    dx, dy = traj[:, 0], traj[:, 1]
    speed = np.linalg.norm(traj, axis=1)

    acc = np.vstack([[0.0, 0.0], np.diff(traj, axis=0)])
    ax, ay = acc[:, 0], acc[:, 1]
    accel_mag = np.linalg.norm(acc, axis=1)

    jerk = np.vstack([[0.0, 0.0], np.diff(acc, axis=0)])
    jerk_mag = np.linalg.norm(jerk, axis=1)

    turn = np.zeros(len(traj), dtype=np.float64)
    dot = (traj[:-1] * traj[1:]).sum(1)
    cross = traj[:-1, 0] * traj[1:, 1] - traj[:-1, 1] * traj[1:, 0]
    turn[1:] = np.arctan2(cross, dot)  # turn[0] = 0, signed

    return np.stack([x, y, dx, dy, speed, ax, ay, accel_mag, jerk_mag, turn], axis=-1).astype(np.float32)


def cond22_from_trajectory(traj, pointer_type, waypoint_count):
    """반환: (22,) = [pointer3, wc_onehot3, sigma4, geom12] (sigma가 geom보다 앞!)."""
    from .canonical_features import geom_features  # BiLSTM 담당이 이 구현이 자기네 것과 일치한다고 확인함

    onehot = [1.0 if pointer_type == p else 0.0 for p in (0, 1, 2)]
    wc_bucket = min(int(waypoint_count), 2)
    wc_onehot = [1.0 if wc_bucket == k else 0.0 for k in range(3)]
    sigma = sigma_features(np.linalg.norm(traj, axis=1))  # raw_speed = norm(traj, axis=1)
    geom = geom_features(traj, int(waypoint_count))
    return np.concatenate([onehot, wc_onehot, sigma, geom]).astype(np.float32)


class BiLSTMPredictor:
    def __init__(self, checkpoint_path_or_bundle, pooling="final_hidden"):
        """checkpoint_path_or_bundle: .pt 파일 경로(str) 또는 이미 로드된 bundle dict
        (번들 체크포인트에서 온 것, keys: weights/seq_mu/seq_sd/threshold_by_pointer/threshold_global)."""
        if isinstance(checkpoint_path_or_bundle, dict):
            b = checkpoint_path_or_bundle
            self.weights = b["weights"]
            self.seq_mu = np.asarray(b["seq_mu"], dtype=np.float32)
            self.seq_sd = np.asarray(b["seq_sd"], dtype=np.float32)
            self.threshold_by_pointer = b.get("threshold_by_pointer")
            self.threshold_global = b.get("threshold_global")
        else:
            raise TypeError("BiLSTMPredictor는 변환된 체크포인트 bundle dict를 기대합니다.")
        self.pooling = pooling

    def _standardize_seq(self, seq10):
        return (seq10 - self.seq_mu[None, :]) / self.seq_sd[None, :]

    def predict_record(self, record, _traj_cond=None):
        """반환: bot_prob (0~1, 높을수록 봇). human_prob = 1 - bot_prob.

        _traj_cond: (traj, cond) 튜플을 이미 갖고 있으면 넘겨서 재계산(특히 cond22의
        sigma-lognormal curve_fit, 레코드당 제일 느린 부분)을 생략할 수 있음 — 주로
        EnsemblePredictor가 jitter_guard와 cond를 공유할 때 씀. 일반적으로는 안 넘겨도 됨."""
        if _traj_cond is not None:
            traj, cond = _traj_cond
        else:
            traj, ptype, wc = _canonical_trajectory(record)
            cond = cond22_from_trajectory(traj, ptype, wc)
        seq10 = self._standardize_seq(seq10_from_trajectory(traj))
        bot_prob = bilstm_forward(self.weights, seq10[None], cond[None], pooling=self.pooling)[0]
        return float(bot_prob)

    def predict_records(self, records):
        seqs, conds = [], []
        for r in records:
            traj, ptype, wc = _canonical_trajectory(r)
            seq10 = self._standardize_seq(seq10_from_trajectory(traj))
            cond = cond22_from_trajectory(traj, ptype, wc)
            seqs.append(seq10)
            conds.append(cond)
        seqs = np.stack(seqs)
        conds = np.stack(conds)
        return bilstm_forward(self.weights, seqs, conds, pooling=self.pooling)

    def predict_gan_records(self, records):
        from .canonical_features import gan_record_to_canonical_trajectory
        seqs, conds = [], []
        for r in records:
            traj, ptype, wc = gan_record_to_canonical_trajectory(r)
            seq10 = self._standardize_seq(seq10_from_trajectory(traj))
            cond = cond22_from_trajectory(traj, ptype, wc)
            seqs.append(seq10)
            conds.append(cond)
        seqs = np.stack(seqs)
        conds = np.stack(conds)
        return bilstm_forward(self.weights, seqs, conds, pooling=self.pooling)
