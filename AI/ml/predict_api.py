"""
통합용 단일 진입점 — **raw 레코드를 그대로 넣으면 판정이 나온다**.

7/29 도입 배경: 정규화와 threshold는 모델에 내장했지만, "raw 궤적 -> (63,8) 텐서" 변환과
"scalar 원핫 채우기"는 여전히 쓰는 쪽이 직접 해야 했다. 이 두 단계를 조금이라도 다르게
구현하면 조용히 틀린 예측이 나온다(실제로 팀 평가 스크립트에서 이런 불일치가 발생). 이
모듈은 학습 때 쓴 것과 **정확히 같은 전처리 함수**를 재사용하므로 그 위험이 사라진다.

사용법(서빙/평가 코드에서):

    from ml.predict_api import load_predictor

    predictor = load_predictor("ml/checkpoint/<체크포인트>.pt")
    result = predictor.predict_record(record)      # record = 수집형 JSON dict 하나
    result["bot_score"]   # 높을수록 봇
    result["is_human"]    # True/False

    results = predictor.predict_records(records)   # 여러 건 한 번에(배치, 훨씬 빠름)

CLI 확인:
    python ml/predict_api.py --checkpoint <체크포인트> --records dataset/human_v2_clean.json --limit 5
"""
import argparse
import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "common"))

from model_cnn_torch import load_model_auto  # noqa: E402
from cnn_canonical_features import human_or_function_record_to_cnn  # noqa: E402
from extend_scalar import geom_features  # noqa: E402


class Predictor:
    """모델 + 전처리를 한 덩어리로 묶은 판정기. 쓰는 쪽은 raw 레코드만 넘기면 된다."""

    def __init__(self, model, info):
        self.model = model
        self.info = info

    def _to_tensors(self, records):
        """raw 레코드 -> (seq, scalar). scalar 차원은 **체크포인트가 요구하는 값에 자동으로 맞춘다.**

        n_scalar=4  : 기존 [waypoint_count, pointer one-hot]
        n_scalar=19 : + waypointCount one-hot(3) + geom 12  (extend_scalar.py 레이아웃)
        쓰는 쪽이 어느 판인지 몰라도 되게 하는 게 목적 — 차원을 틀리면 조용히 나빠지는 게 아니라
        모델 로딩에서 즉시 에러가 나지만, 애초에 틀릴 일이 없게 여기서 맞춘다.
        """
        n_scalar = self.info.get("n_scalar", 4)
        if n_scalar == 23 and not hasattr(self, "_sigma_warned"):
            print("⚠ scalar 23차원(sigma 포함) 모델입니다 — 추론 시 샘플당 약 344ms가 "
                  "추가됩니다(Sigma-Lognormal 적합). 실시간 서빙에는 부적합할 수 있습니다.")
            self._sigma_warned = True
        seqs, scalars = [], []
        for r in records:
            seq, scalar4, _ = human_or_function_record_to_cnn(r)  # 학습 때와 동일한 전처리
            seqs.append(seq)
            if n_scalar == 4:
                scalars.append(scalar4)
                continue
            if n_scalar not in (19, 23):
                raise ValueError(f"지원하지 않는 scalar 차원: {n_scalar} (4/19/23만 지원)")
            wc = int(scalar4[0])
            s19 = np.zeros(19, dtype=np.float32)
            s19[:4] = scalar4
            s19[4 + min(wc, 2)] = 1.0
            s19[7:] = geom_features(seq[:, 2:4], wc)   # seq의 채널 2,3 = canonical 변위
            if n_scalar == 19:
                scalars.append(s19)
                continue
            # sigma 4차원 — 학습 때(extend_scalar_sigma.py)와 같은 함수를 그대로 호출한다.
            from ml.bilstm.sigma_lognormal import sigma_features, raw_speed
            try:
                sig = np.asarray(sigma_features(raw_speed({"trajectory": seq[:, 2:4]})),
                                 dtype=np.float32)
            except Exception:
                sig = np.zeros(4, dtype=np.float32)
            scalars.append(np.concatenate([s19, sig]).astype(np.float32))
        return (torch.from_numpy(np.stack(seqs)).float(),
                torch.from_numpy(np.stack(scalars)).float())

    def predict_records(self, records):
        """레코드 리스트 -> 판정 dict 리스트."""
        if not records:
            return []
        seq_t, scalar_t = self._to_tensors(records)
        out = self.model.decide(seq_t, scalar_t)
        results = []
        for i, r in enumerate(records):
            results.append({
                "human_prob": float(out["human_prob"][i]),
                "bot_score": float(out["bot_score"][i]),
                "is_human": bool(out["is_human"][i]),
                "threshold": float(out["threshold"][i]),
                "pointer_type": r.get("device", {}).get("pointerType"),
            })
        return results

    def predict_record(self, record):
        """레코드 하나 -> 판정 dict 하나."""
        return self.predict_records([record])[0]


def load_predictor(checkpoint_path, device="cpu", dropout=0.3, verbose=True):
    """체크포인트 경로만 주면 끝 — 구조/정규화/threshold 전부 자동 인식."""
    model, info = load_model_auto(checkpoint_path, device=device, dropout=dropout, verbose=verbose)
    if not info.get("baked_pointer_norm"):
        print("⚠ 이 체크포인트에는 pointer 정규화가 내장돼 있지 않습니다 — 예전 방식으로 학습된 "
              "체크포인트라면 정확도가 떨어질 수 있습니다.")
    if not info.get("baked_threshold"):
        print("⚠ 이 체크포인트에는 threshold가 내장돼 있지 않습니다 — decide() 호출 시 "
              "threshold_override 를 직접 넘겨야 합니다.")
    return Predictor(model, info)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--records", required=True, help="수집형 JSON 배열 파일 경로")
    ap.add_argument("--limit", type=int, default=5)
    args = ap.parse_args()

    predictor = load_predictor(args.checkpoint)
    records = json.load(open(args.records, encoding="utf-8"))[:args.limit]
    results = predictor.predict_records(records)

    print(f"\n{'pointer':8} {'human_prob':>11} {'threshold':>10} {'bot_score':>10}  판정")
    for r in results:
        print(f"{str(r['pointer_type']):8} {r['human_prob']:11.4f} {r['threshold']:10.4f} "
              f"{r['bot_score']:10.4f}  {'사람' if r['is_human'] else '봇'}")


if __name__ == "__main__":
    main()
