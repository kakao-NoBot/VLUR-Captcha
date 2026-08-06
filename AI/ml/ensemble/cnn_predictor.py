"""Ultra_CNN_v2 단독 predictor. torch 없이 바로 로드/추론 가능(numpy만 필요).

사용법:
    from cnn_predictor import CNNPredictor
    predictor = CNNPredictor("ultra_cnn_v2_FINAL.pt")
    result = predictor.predict_record(record)   # record: 수집형 human/function 원본 JSON dict
    result["bot_score"], result["is_human"], result["threshold"]

    results = predictor.predict_records(records)  # 배치, 훨씬 빠름
    results = predictor.predict_gan_records(gan_jsonl_records)  # GAN v2 jsonl 레코드용
"""
import numpy as np

from .cnn_np_forward import forward
from .canonical_features import (
    human_or_function_to_canonical_trajectory,
    canonical_to_cnn_sequence,
    scalar19_from_seq,
    record_to_cnn_inputs,
)

POINTER_NAMES = ("mouse", "touch", "pen")


class CNNPredictor:
    def __init__(self, checkpoint_path_or_weights):
        """checkpoint_path_or_weights: .pt 파일 경로(str) 또는 이미 로드된 weights dict
        (번들 체크포인트에서 온 것 등)."""
        if isinstance(checkpoint_path_or_weights, dict):
            self.weights = checkpoint_path_or_weights
        else:
            raise TypeError("CNNPredictor는 변환된 체크포인트 가중치 dict를 기대합니다.")
        self.pointer_thresholds = self.weights["pointer_thresholds"]  # [mouse, touch, pen]
        self.global_threshold = float(self.weights["global_threshold"])

    def _decide(self, p_human, pointer_type):
        thr = float(self.pointer_thresholds[pointer_type]) if pointer_type in (0, 1, 2) else self.global_threshold
        return bool(p_human > thr), thr

    def predict_record(self, record):
        traj, ptype, wc, _label = human_or_function_to_canonical_trajectory(record)
        seq = canonical_to_cnn_sequence(traj)
        scalar = scalar19_from_seq(seq, ptype, wc)
        p_human = float(forward(self.weights, seq[None], scalar[None])[0])
        is_human, thr = self._decide(p_human, ptype)
        return {
            "bot_score": 1.0 - p_human,
            "human_prob": p_human,
            "is_human": is_human,
            "threshold": thr,
            "pointer_type": POINTER_NAMES[ptype] if ptype in (0, 1, 2) else "unknown",
        }

    def predict_records(self, records):
        seqs, scalars, ptypes = [], [], []
        for r in records:
            traj, ptype, wc, _label = human_or_function_to_canonical_trajectory(r)
            seq = canonical_to_cnn_sequence(traj)
            seqs.append(seq)
            scalars.append(scalar19_from_seq(seq, ptype, wc))
            ptypes.append(ptype)
        seqs = np.stack(seqs)
        scalars = np.stack(scalars)
        ptypes = np.array(ptypes)
        p_human = forward(self.weights, seqs, scalars)
        thr = np.where(
            (ptypes >= 0) & (ptypes <= 2),
            self.pointer_thresholds[np.clip(ptypes, 0, 2)],
            self.global_threshold,
        )
        is_human = p_human > thr
        return [
            {
                "bot_score": 1.0 - float(p_human[i]),
                "human_prob": float(p_human[i]),
                "is_human": bool(is_human[i]),
                "threshold": float(thr[i]),
                "pointer_type": POINTER_NAMES[ptypes[i]] if ptypes[i] in (0, 1, 2) else "unknown",
            }
            for i in range(len(records))
        ]

    def predict_gan_records(self, records):
        from .canonical_features import gan_record_to_canonical_trajectory
        seqs, scalars, ptypes = [], [], []
        for r in records:
            traj, ptype, wc = gan_record_to_canonical_trajectory(r)
            seq = canonical_to_cnn_sequence(traj)
            seqs.append(seq)
            scalars.append(scalar19_from_seq(seq, ptype, wc))
            ptypes.append(ptype)
        seqs = np.stack(seqs)
        scalars = np.stack(scalars)
        p_human = forward(self.weights, seqs, scalars)
        return p_human  # GAN엔 pointer=pen이 없어 단순 확률 배열만 반환
