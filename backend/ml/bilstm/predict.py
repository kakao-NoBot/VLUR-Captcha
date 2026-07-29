"""서비용 추론 — 학습 체크포인트(.pt) 하나로 raw 드래그 레코드 읽어 사람/봇 판정.

체크포인트가 **전처리 변환(features/lognormal/sigma)과 이상 임계값을 스스로 기억**하므로, 서비 코드는
학습과 100% 동일한 전처리를 자동 재현한다(불일치 = 조용한 실패의 최대 원인). FastAPI/Flask 등
서비스에서 `DragClassifier`를 임포트해 `.predict(record)`만 호출하면 된다.

  # CLI 테스트(직접 JSON 레코드들 파일)
  python3 ml/bilstm/predict.py --ckpt ml/bilstm/bilstm_v2_person_rich_sigmaln_ckpt.pt \
      --input dataset/human_v2_clean.json --limit 5

서비 입력(record) = 수집기(DragCollector)가 내보내는 것과 동일 스키마: points·task·device·accel 등.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from ml.bilstm.model import DragBiLSTM, pick_device  # noqa: E402
from ml.bilstm.prepare_bilstm_data import seq_features, build_cond  # noqa: E402
from ml.common.canonical_tensor import human_or_function_to_canonical  # noqa: E402
from ml.common.record_guards import RecordValidationError  # noqa: E402


class DragClassifier:
    """체크포인트 1개 = 모델 + 전처리 변환 + 정규화 통계 + 임계값. 서비에 필요한 전부."""

    def __init__(self, ckpt_path, device=None, fpr="005"):
        self.device = device or pick_device()
        c = torch.load(ckpt_path, map_location=self.device, weights_only=False)
        self.cfg = c
        self.model = DragBiLSTM(c["in_dim"], c["hidden"], c["layers"], c["cond_dim"], c["dropout"]).to(self.device)
        self.model.load_state_dict(c["model"])
        self.model.eval()
        self.mu, self.sd = c["mu"], c["sd"]
        self.track = c["track"]
        self.rich = c.get("features", "basic") == "rich"
        self.lognormal = c.get("lognormal", False)
        self.sigma = c.get("sigma_lognormal", False)
        self.dt = c.get("dt", False)
        # 임계값: val에서 사람 오차단(FPR) 목표로 고정된 값(train이 체크포인트에 내려줌).
        self.threshold = float(c.get(f"threshold_fpr{fpr}", 0.5))
        self.fpr = fpr

    @torch.no_grad()
    def prob(self, record) -> float:
        """봇일 확률 0~1. 전처리는 학습 때(체크포인트 기록)와 완전 동일하게 재현."""
        canon = human_or_function_to_canonical(record, strict=False)  # 서비스 관대하게(형식 검증은 predict에서)
        x = seq_features(canon, self.rich, self.lognormal)
        cd = build_cond(canon, record, self.track, self.sigma, self.dt)
        x = ((x - self.mu) / self.sd).astype(np.float32)
        xt = torch.tensor(x[None], device=self.device)
        ct = torch.tensor(cd[None], dtype=torch.float32, device=self.device)
        return float(torch.sigmoid(self.model(xt, ct)).cpu())

    def predict(self, record) -> dict:
        """최종 판정 결과. 형식이 깨진 레코드는 fail-closed(의심=봇)로 처리."""
        try:
            p = self.prob(record)
        except (RecordValidationError, KeyError, ValueError, IndexError) as e:
            return {"bot_probability": 1.0, "is_bot": True, "threshold": self.threshold,
                    "error": f"invalid_record: {type(e).__name__}"}
        return {"bot_probability": p, "is_bot": bool(p >= self.threshold), "threshold": self.threshold}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--input", required=True, help="수집 JSON(레코드 배열)")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--fpr", choices=["005", "001"], default="005", help="임계값: 사람 오차단 상한 0.5%%(005)/0.1%%(001)")
    args = ap.parse_args()

    clf = DragClassifier(args.ckpt, fpr=args.fpr)
    c = clf.cfg
    print(f"모델: {args.ckpt}")
    print(f"  전처리 변환: features={c.get('features')} lognormal={clf.lognormal} sigma={clf.sigma}")
    print(f"  임계값(FPR{args.fpr}) {clf.threshold:.4f} | val_AUC {c.get('val_auc', float('nan')):.4f} | in_dim {c['in_dim']} cond_dim {c['cond_dim']}")
    recs = json.load(open(args.input))[:args.limit]
    for i, r in enumerate(recs):
        out = clf.predict(r)
        tag = "BOT " if out["is_bot"] else "HUMAN"
        err = f"  ({out['error']})" if out.get("error") else ""
        print(f"  #{i}: bot_prob {out['bot_probability']:.4f} → {tag}{err}")


if __name__ == "__main__":
    main()
