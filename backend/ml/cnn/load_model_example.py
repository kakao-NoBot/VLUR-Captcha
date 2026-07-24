"""
학습된 체크포인트를 불러와서 추론 한 번 해보는 예제 스크립트.

⚠ domain_adversarial로 학습한 체크포인트(예: v2_torch_random_hardneg_best.pt)는
build_model()의 n_domains를 반드시 값을 같게 줘야 함 → 안 주면 모델 구조에서 domain_head가
없는 상태로 만들어져서, 그 체크포인트가 가진 domain_head 가중치를 못 싣고 에러가 남.

사용법:
    python ml/load_model_example.py --checkpoint ml/checkpoints/v2_torch_random_hardneg_best.pt
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

from model_cnn_torch import build_model  # noqa: E402
from cnn_canonical_features import human_or_function_record_to_cnn  # noqa: E402


def load_model_and_calibration(checkpoint_path: str, n_domains: int = None, dropout: float = 0.3):
    """checkpoint_path + 같은 이름의 .calibration.json을 같이 불러온다.

    n_domains: 이 체크포인트가 --domain_adversarial로 학습됐으면 3(function/gan/rl)을
        반드시 넘길 것. 아니면 None(기본).
    dropout: 학습 때 --dropout을 줬으면 그 값과 맞출 것(기본 0.3).
    """
    calib_path = checkpoint_path.replace("_best.pt", "_best.calibration.json")
    if not os.path.exists(calib_path):
        # 파일명 규칙이 다르면(예: 사용자가 다운로드하면서 이름이 바뀐 경우) 같은 폴더에서 검색
        calib_path = checkpoint_path.rsplit(".pt", 1)[0] + ".calibration.json"
    calibration = json.load(open(calib_path, encoding="utf-8")) if os.path.exists(calib_path) else None

    model = build_model(seq_channels=8, n_scalar=4, dropout=dropout, n_domains=n_domains)
    model.load_state_dict(torch.load(checkpoint_path, map_location="cpu"))
    model.eval()
    return model, calibration


@torch.no_grad()
def predict_one(model, seq, scalar):
    """seq: (63,8) numpy, scalar: (4,) numpy -> 사람일 확률(0~1) 반환."""
    seq_t = torch.from_numpy(seq).float().unsqueeze(0)      # (1,63,8)
    scalar_t = torch.from_numpy(scalar).float().unsqueeze(0)  # (1,4)
    logit = model(seq_t, scalar_t)  # grl_lambda 안 줌 -> domain_head 있어도 그냥 무시됨(정상)
    return torch.sigmoid(logit).item()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument(
        "--n_domains", type=int, default=None,
        help="domain_adversarial로 학습한 체크포인트면 3을 줄 것(function/gan/rl). "
             "아니면 생략(None).",
    )
    parser.add_argument("--dropout", type=float, default=0.3, help="학습 때 --dropout 값과 맞출 것")
    args = parser.parse_args()

    model, calibration = load_model_and_calibration(args.checkpoint, n_domains=args.n_domains, dropout=args.dropout)
    print("모델 로딩 성공.")
    if calibration:
        print(f"threshold={calibration['threshold']:.4f} (score_direction={calibration['score_direction']})")
    else:
        print("⚠ calibration.json을 못 찾음 → threshold 없이 raw 확률만 볼 수 있음.")

    # 사용 예시: dataset/human_v2_clean.json 첫 레코드로 실제 추론 한 번 해보기
    sample_path = os.path.join(HERE, "..", "dataset", "human_v2_clean.json")
    if os.path.exists(sample_path):
        record = json.load(open(sample_path, encoding="utf-8"))[0]
        seq, scalar, label = human_or_function_record_to_cnn(record)
        prob = predict_one(model, seq, scalar)
        print(f"샘플(label={label}) 예측: 사람일 확률={prob:.4f}")
        if calibration:
            verdict = "사람" if prob >= calibration["threshold"] else "봇"
            print(f"threshold 적용 판정: {verdict}")


if __name__ == "__main__":
    main()
