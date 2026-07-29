"""
팀 공통 비교 지표 리포트 생성 — CNN_A/CNN_B/BILSTM_A/BILSTM_OWNER 네 모델 비교용.

메시지에 명시된 공통 비교 지표를 전부 뽑아서 JSON으로 저장한다:
    AUROC, AUPRC, F1, Human FPR, Bot recall, Function/GAN/RL recall,
    mouse/touch/pen Human FPR, non-finite count, collapse 여부,
    parameter count, inference latency

⚠ MODEL_SUBMISSION_TEMPLATE.json이 이번 전달본에 빠져있어서(체크섬에는 있는데 실제 파일 없음),
정확한 제출 필드명/포맷은 아직 확정 못했다 — 일단 이 스크립트가 뽑는 필드명으로 저장해두고,
템플릿 오면 매핑만 다시 맞추면 된다.

사용법:
    python ml/generate_comparison_report.py --checkpoint v2_torch_random_da0.05_best.pt \
        --model_name CNN_A --split_mode random --n_domains 3 --dropout 0.5
"""
import argparse
import json
import os
import sys
import time

import numpy as np
import torch
from sklearn.metrics import roc_auc_score, average_precision_score, f1_score

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "common"))

from cnn_canonical_features import (  # noqa: E402
    human_or_function_record_to_cnn, canonical_to_cnn_sequence, canonical_to_scalar_features,
)
from cnn_features_contract_correct import human_or_function_to_contract_correct  # noqa: E402

from data_pipeline_v2common import add_reversal_channel, load_track_common  # noqa: E402
from model_cnn_torch import build_model  # noqa: E402
from threshold_policy import find_threshold_for_human_fpr, operating_point_report  # noqa: E402

CKPT_DIR = os.path.join(HERE, "checkpoints")
REPORT_DIR = os.path.join(HERE, "reports")
DATASET_DIR = os.path.join(HERE, "..", "dataset")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


@torch.no_grad()
def predict(model, seq, scalar, batch_size=1024):
    model.eval()
    preds = []
    for i in range(0, len(seq), batch_size):
        seq_b = torch.from_numpy(seq[i:i + batch_size]).float().to(DEVICE)
        scalar_b = torch.from_numpy(scalar[i:i + batch_size]).float().to(DEVICE)
        logit = model(seq_b, scalar_b)
        preds.append(torch.sigmoid(logit).cpu().numpy())
    return np.concatenate(preds)


def measure_inference_latency(model, seq, scalar, n_warmup=5, n_measure=50, batch_size=1):
    """단일 샘플 추론 지연시간(ms) 측정 — warmup 후 평균."""
    model.eval()
    idx = np.random.choice(len(seq), min(batch_size, len(seq)), replace=False)
    seq_b = torch.from_numpy(seq[idx]).float().to(DEVICE)
    scalar_b = torch.from_numpy(scalar[idx]).float().to(DEVICE)

    with torch.no_grad():
        for _ in range(n_warmup):
            model(seq_b, scalar_b)

    times = []
    with torch.no_grad():
        for _ in range(n_measure):
            t0 = time.perf_counter()
            model(seq_b, scalar_b)
            times.append((time.perf_counter() - t0) * 1000)  # ms
    return {
        "mean_ms": float(np.mean(times)), "p50_ms": float(np.percentile(times, 50)),
        "p95_ms": float(np.percentile(times, 95)), "batch_size": int(len(idx)),
    }


def check_non_finite(preds, seq, scalar):
    return {
        "preds_non_finite": int((~np.isfinite(preds)).sum()),
        "seq_non_finite": int((~np.isfinite(seq)).sum()),
        "scalar_non_finite": int((~np.isfinite(scalar)).sum()),
    }


def check_collapse(preds, y):
    """모델이 사실상 한 값만 뱉는(collapse) 상태인지 진단.

    기준: 예측값의 표준편차가 극히 작거나, 실제로는 여러 클래스인데 예측 라벨이 전부 한
    쪽으로 쏠렸는지(사람 전부 봇으로/봇 전부 사람으로 판정 등).
    """
    pred_std = float(np.std(preds))
    pred_label = (preds >= 0.5).astype(int)
    all_one_class = len(set(pred_label.tolist())) == 1
    collapsed = pred_std < 1e-4 or all_one_class
    return {
        "collapsed": bool(collapsed), "pred_std": pred_std,
        "pred_label_unique_count": len(set(pred_label.tolist())),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--model_name", default="CNN", help="제출용 모델 식별자(예: CNN_A, CNN_B)")
    parser.add_argument("--track", default="v2", choices=["v2"])
    parser.add_argument("--split_mode", choices=["person", "random", "kfold"], default="random")
    parser.add_argument("--fold", type=int, default=0)
    parser.add_argument("--preprocessing_mode", choices=["legacy_rotated", "contract_correct"], default="legacy_rotated")
    parser.add_argument("--dropout", type=float, default=0.3)
    parser.add_argument("--n_domains", type=int, default=None)
    parser.add_argument("--add_reversal_channel", action="store_true", help="9채널(reversal 포함)로 학습한 체크포인트면 켤 것")
    parser.add_argument("--reversal_window", type=int, default=5, help="학습 때 --reversal_window 값과 맞출 것")
    parser.add_argument("--target_fpr", type=float, default=0.005)
    parser.add_argument(
        "--extra_redteam_file", default=None,
        help="선택. 추가 held-out 봇 파일(예: kinematic_synth.py 결과물) — 팀 공식 지표는 아니지만 "
             "참고용으로 리포트에 같이 넣고 싶을 때.",
    )
    parser.add_argument("--extra_redteam_name", default="extra")
    args = parser.parse_args()

    os.makedirs(REPORT_DIR, exist_ok=True)
    # 7/25 버그 수정: 예전엔 "폴더 포함 상대경로가 존재 안 하면 무조건 CKPT_DIR을 앞에 붙임"
    # 이라 ml/checkpoint2/xxx.pt처럼 이미 폴더가 들어간 경로를 줘도 ml/checkpoints/ml/checkpoint2/
    # ...처럼 겹쳐서 깨졌음. 이제 "경로 구분자가 아예 없는 순수 파일명"일 때만 CKPT_DIR을
    # 붙이고, 그 외(상대경로·절대경로 다 포함)는 준 그대로 쓰고 없으면 바로 명확한 에러를 냄.
    if os.sep in args.checkpoint or "/" in args.checkpoint:
        ckpt_path = args.checkpoint
    else:
        ckpt_path = os.path.join(CKPT_DIR, args.checkpoint)
    if not os.path.exists(ckpt_path):
        raise FileNotFoundError(
            f"체크포인트를 못 찾음: {ckpt_path}\n"
            f"  --checkpoint에 폴더가 포함된 경로를 줬으면 그 경로 그대로 쓰고(자동으로 "
            f"ml/checkpoints/를 안 붙임), 폴더 없이 파일명만 줬으면 ml/checkpoints/ 안에서 찾음. "
            f"정확한 파일명은 `dir` 로 다시 확인할 것."
        )

    print(f"[report] checkpoint={ckpt_path}")
    splits = load_track_common(
        args.track, cache=True, split_mode=args.split_mode, fold=args.fold,
        preprocessing_mode=args.preprocessing_mode, add_reversal_channel_flag=args.add_reversal_channel, reversal_window=args.reversal_window,
    )
    val_seq, val_scalar, val_y, val_source, _, val_pointer, _ = splits["validation"]
    test_seq, test_scalar, test_y, test_source, _, test_pointer, _ = splits["test"]
    rl_redteam = splits.get("diagnostic_redteam_a")  # RL은 test가 아니라 여기 별도로 있음

    model = build_model(seq_channels=test_seq.shape[2], n_scalar=test_scalar.shape[1],
                         device=DEVICE, dropout=args.dropout, n_domains=args.n_domains)
    model.load_state_dict(torch.load(ckpt_path, map_location=DEVICE))
    param_count = sum(p.numel() for p in model.parameters())

    val_preds = predict(model, val_seq, val_scalar)
    test_preds = predict(model, test_seq, test_scalar)
    threshold = find_threshold_for_human_fpr(val_preds[val_y == 1], target_fpr=args.target_fpr)

    auroc = roc_auc_score(test_y, test_preds)
    # AUPRC/F1은 "봇을 양성(positive)"으로 보는 게 관례라 y를 뒤집어서 계산(사람=0, 봇=1)
    bot_label = 1 - test_y
    bot_score = 1 - test_preds
    auprc = average_precision_score(bot_label, bot_score)
    pred_bot_label = (bot_score >= (1 - threshold)).astype(int)
    f1 = f1_score(bot_label, pred_bot_label)

    fpr_at_t, recall_at_t = operating_point_report(test_y, test_preds, threshold)

    per_source_recall = {}
    human_mask = test_source == "human"
    for src in sorted(set(test_source) - {"human"}):
        mask = test_source == src
        if mask.sum() == 0:
            continue
        _, r = operating_point_report(
            np.concatenate([test_y[human_mask], test_y[mask]]),
            np.concatenate([test_preds[human_mask], test_preds[mask]]),
            threshold,
        )
        per_source_recall[src] = float(r)

    # RL은 test에 없고 diagnostic_redteam_a에 별도로 있음 — human test 서브셋과 합쳐서 평가
    if rl_redteam is not None and len(rl_redteam[0]) > 0:
        rl_seq, rl_scalar, _, _, _, _, _ = rl_redteam
        rl_preds = predict(model, rl_seq, rl_scalar)
        rl_y = np.concatenate([np.ones(human_mask.sum()), np.zeros(len(rl_seq))]).astype(np.float32)
        rl_full_preds = np.concatenate([test_preds[human_mask], rl_preds])
        _, rl_recall = operating_point_report(rl_y, rl_full_preds, threshold)
        per_source_recall["rl"] = float(rl_recall)
        rl_test_size = len(rl_seq)
    else:
        rl_test_size = 0

    pointer_fpr = {}
    for p in sorted(set(test_pointer) - {""}):
        hm = (test_pointer == p) & human_mask
        if hm.sum() == 0:
            continue
        fpr_p, _ = operating_point_report(test_y[hm], test_preds[hm], threshold)
        pointer_fpr[p] = float(fpr_p)

    extra_recall = None
    if args.extra_redteam_file:
        extra_path = os.path.join(DATASET_DIR, args.extra_redteam_file)
        with open(extra_path, "r", encoding="utf-8") as f:
            extra_records = json.load(f)

        def extra_record_to_cnn(r):
            if args.preprocessing_mode == "legacy_rotated":
                return human_or_function_record_to_cnn(r)
            canonical = human_or_function_to_contract_correct(r)
            return (canonical_to_cnn_sequence(canonical), canonical_to_scalar_features(canonical), canonical["label"])

        extra_seq, extra_scalar = [], []
        for r in extra_records:
            s, sc, _ = extra_record_to_cnn(r)
            extra_seq.append(s)
            extra_scalar.append(sc)
        extra_seq, extra_scalar = np.stack(extra_seq), np.stack(extra_scalar)
        if args.add_reversal_channel:
            extra_seq = add_reversal_channel(extra_seq, window=args.reversal_window)
        extra_preds = predict(model, extra_seq, extra_scalar)
        extra_y = np.concatenate([np.ones(human_mask.sum()), np.zeros(len(extra_seq))]).astype(np.float32)
        extra_full_preds = np.concatenate([test_preds[human_mask], extra_preds])
        _, extra_recall = operating_point_report(extra_y, extra_full_preds, threshold)

    report = {
        "model_name": args.model_name,
        "framework": "pytorch",
        "checkpoint": os.path.basename(ckpt_path),
        "track": args.track,
        "split_mode": args.split_mode,
        "preprocessing_mode": args.preprocessing_mode,
        "threshold": float(threshold),
        "target_fpr": args.target_fpr,
        "timing_features_used": False,  # 공간 입력만 사용(dt/dt_cv/coalesced 전부 미사용)
        "input_channels": ["dx", "dy", "vx", "vy", "speed", "accel_mag", "jerk_mag", "turn_angle"],
        "scalar_features": ["waypoint_count", "pointer_mouse", "pointer_touch", "pointer_pen"],
        "metrics": {
            "AUROC": float(auroc),
            "AUPRC": float(auprc),
            "F1": float(f1),
            "Human_FPR": float(fpr_at_t),
            "Bot_recall_overall": float(recall_at_t),
            "Function_recall": per_source_recall.get("function"),
            "GAN_recall": per_source_recall.get("gan"),
            "RL_recall": per_source_recall.get("rl"),
            **({f"{args.extra_redteam_name}_recall": float(extra_recall)} if extra_recall is not None else {}),
        },
        "pointer_Human_FPR": pointer_fpr,
        "non_finite": check_non_finite(test_preds, test_seq, test_scalar),
        "collapse_check": check_collapse(test_preds, test_y),
        "parameter_count": int(param_count),
        "inference_latency": measure_inference_latency(model, test_seq, test_scalar),
        "test_set_size": {
            "total": int(len(test_y)),
            "human": int(human_mask.sum()),
            **{k: int((test_source == k).sum()) for k in set(test_source) - {"human"}},
            "rl_note": "RL은 test가 아니라 diagnostic_redteam_a(별도 held-out)에서 옴",
            "rl": rl_test_size,
        },
    }

    ckpt_tag = os.path.splitext(os.path.basename(ckpt_path))[0]
    extra_tag = f"_{args.extra_redteam_name}" if args.extra_redteam_file else ""
    out_path = os.path.join(REPORT_DIR, f"{args.model_name}_{args.track}_{args.split_mode}_{ckpt_tag}{extra_tag}_comparison_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\n[report] 저장: {out_path}")


if __name__ == "__main__":
    main()
