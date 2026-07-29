"""
재학습 없이 여러 target_fpr 후보를 한 번에 점검하는 스윕 도구.

이미 학습된 체크포인트로 validation/test/diffusion/RL 예측을 **딱 한 번씩만** 하고, 그
예측값 위에서 threshold만 여러 개(target_fpr별로) 계산해서 비교한다 — target_fpr 후보마다
다시 학습·다시 diffusion을 읽는 것보다 diffusion 소모를 줄일 수 있다.

⚠ 그래도 표 하나에 diffusion recall을 여러 개 나란히 놓고 보면 "제일 잘 나오는 target_fpr을
고르는" 함정에 빠지기 쉽다 — target_fpr 최종 결정은 diffusion 숫자를 보지 말고 validation의
Human FPR/Function/GAN recall만으로 하고, diffusion 행은 참고만 할 것.

사용법:
    python ml/sweep_target_fpr.py --checkpoint ml/checkpoints/v2_torch_person_hardneg_best.pt \
        --split_mode person --target_fprs 0.005,0.01,0.02 --diffusion_file bot_diffusion_v2.json \
        --dropout 0.5

체크포인트가 --domain_adversarial로 학습된 것이면 --n_domains 3도 같이 줄 것(안 그러면
state_dict 로딩 실패).
"""
import argparse
import json
import os
import sys

import numpy as np
import torch
from sklearn.metrics import roc_auc_score

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "common"))

from cnn_canonical_features import human_or_function_record_to_cnn  # noqa: E402
from cnn_features_contract_correct import human_or_function_to_contract_correct  # noqa: E402
from cnn_canonical_features import canonical_to_cnn_sequence, canonical_to_scalar_features  # noqa: E402
from data_pipeline_v2common import add_reversal_channel, load_track_common  # noqa: E402
from diffusion_audit import log_diffusion_use  # noqa: E402
from model_cnn_torch import build_model  # noqa: E402
from threshold_policy import find_threshold_for_human_fpr, operating_point_report, tpr_at_fpr  # noqa: E402

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, help="체크포인트 파일명 또는 전체 경로")
    parser.add_argument("--track", default="v2", choices=["v2"])
    parser.add_argument("--split_mode", choices=["person", "random", "kfold"], default="random")
    parser.add_argument("--fold", type=int, default=0)
    parser.add_argument("--preprocessing_mode", choices=["legacy_rotated", "contract_correct"], default="legacy_rotated")
    parser.add_argument("--target_fprs", required=True, help="쉼표로 구분, 예: 0.005,0.01,0.02")
    parser.add_argument("--diffusion_file", default=None)
    parser.add_argument(
        "--extra_redteam_file", default=None,
        help="diffusion 외 추가 held-out 봇 파일(예: kinematic_synth.py 결과물). 재학습 없이 "
             "이 스윕에서 같이 평가만 함.",
    )
    parser.add_argument("--extra_redteam_name", default="extra", help="위 파일을 결과에 뭐라고 표시할지")
    parser.add_argument("--dropout", type=float, default=0.3, help="학습 때 --dropout 값과 맞출 것")
    parser.add_argument("--n_domains", type=int, default=None, help="--domain_adversarial로 학습한 체크포인트면 3")
    parser.add_argument("--add_reversal_channel", action="store_true", help="9채널(reversal 포함)로 학습한 체크포인트면 켤 것")
    parser.add_argument("--reversal_window", type=int, default=5, help="학습 때 --reversal_window 값과 맞출 것")
    parser.add_argument(
        "--domain_adversarial", action="store_true",
        help="이 스크립트에선 아무 동작 안 함(no-op) — n_domains만 주면 충분함. train_common_torch.py "
             "명령어를 그대로 복붙하다 실수로 넣어도 에러 안 나게 하려고 받아만 줌.",
    )
    args = parser.parse_args()
    os.makedirs(REPORT_DIR, exist_ok=True)

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

    print(f"[sweep] device={DEVICE}")
    print(f"[sweep] checkpoint={ckpt_path}")
    print(f"[sweep] split_mode={args.split_mode} preprocessing={args.preprocessing_mode}")
    target_fprs = [float(x) for x in args.target_fprs.split(",")]
    print(f"[sweep] target_fprs={target_fprs}")

    splits = load_track_common(
        args.track, cache=True, split_mode=args.split_mode, fold=args.fold,
        preprocessing_mode=args.preprocessing_mode, add_reversal_channel_flag=args.add_reversal_channel, reversal_window=args.reversal_window,
    )
    val_seq, val_scalar, val_y, val_source, _, _, _ = splits["validation"]
    test_seq, test_scalar, test_y, test_source, _, _, _ = splits["test"]
    rl_redteam = splits.get("diagnostic_redteam_a")

    model = build_model(seq_channels=val_seq.shape[2], n_scalar=val_scalar.shape[1],
                         device=DEVICE, dropout=args.dropout, n_domains=args.n_domains)
    model.load_state_dict(torch.load(ckpt_path, map_location=DEVICE))

    print("[sweep] predicting validation/test (once)...")
    val_preds = predict(model, val_seq, val_scalar)
    test_preds = predict(model, test_seq, test_scalar)
    human_val_preds = val_preds[val_y == 1]
    general_auc = roc_auc_score(test_y, test_preds)

    diff_preds = None
    diffusion_auc = None
    if args.diffusion_file:
        print("[sweep] loading diffusion + predicting (once)...")
        diff_path = os.path.join(DATASET_DIR, args.diffusion_file)
        with open(diff_path, "r", encoding="utf-8") as f:
            diffusion_records = json.load(f)

        def diff_record_to_cnn(r):
            if args.preprocessing_mode == "legacy_rotated":
                return human_or_function_record_to_cnn(r)
            canonical = human_or_function_to_contract_correct(r)
            return (canonical_to_cnn_sequence(canonical), canonical_to_scalar_features(canonical), canonical["label"])

        diff_seq, diff_scalar = [], []
        for r in diffusion_records:
            s, sc, _ = diff_record_to_cnn(r)
            diff_seq.append(s)
            diff_scalar.append(sc)
        diff_seq, diff_scalar = np.stack(diff_seq), np.stack(diff_scalar)
        if args.add_reversal_channel:
            diff_seq = add_reversal_channel(diff_seq, window=args.reversal_window)
        diff_preds = predict(model, diff_seq, diff_scalar)

        human_mask = test_source == "human"
        redteam_y = np.concatenate([np.ones(human_mask.sum()), np.zeros(len(diff_seq))]).astype(np.float32)
        redteam_preds = np.concatenate([test_preds[human_mask], diff_preds])
        diffusion_auc = roc_auc_score(redteam_y, redteam_preds)
        log_diffusion_use(
            "sweep_target_fpr.py", f"{args.track} target_fpr 스윕({target_fprs}) 참고용 평가",
            {"checkpoint": os.path.basename(ckpt_path), "split_mode": args.split_mode},
            dataset_path=diff_path, model_checkpoint_path=ckpt_path,
        )

    rl_preds = None
    rl_auc = None
    if rl_redteam is not None and len(rl_redteam[0]) > 0:
        rl_seq, rl_scalar, _, _, _, _, _ = rl_redteam
        rl_preds = predict(model, rl_seq, rl_scalar)
        human_mask = test_source == "human"
        rl_y = np.concatenate([np.ones(human_mask.sum()), np.zeros(len(rl_seq))]).astype(np.float32)
        rl_full_preds = np.concatenate([test_preds[human_mask], rl_preds])
        rl_auc = roc_auc_score(rl_y, rl_full_preds)
        if args.diffusion_file:
            rl_dir = os.path.join(DATASET_DIR, "rl_bot_v2")
            log_diffusion_use(
                "sweep_target_fpr.py (RL)", f"{args.track} target_fpr 스윕 RL 참고용 평가",
                {"checkpoint": os.path.basename(ckpt_path), "split_mode": args.split_mode},
                dataset_path=rl_dir if os.path.isdir(rl_dir) else None, model_checkpoint_path=ckpt_path,
            )

    extra_preds = None
    extra_auc = None
    if args.extra_redteam_file:
        print(f"[sweep] loading {args.extra_redteam_name} + predicting (once)...")
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

        human_mask = test_source == "human"
        extra_y = np.concatenate([np.ones(human_mask.sum()), np.zeros(len(extra_seq))]).astype(np.float32)
        extra_full_preds = np.concatenate([test_preds[human_mask], extra_preds])
        extra_auc = roc_auc_score(extra_y, extra_full_preds)
        log_diffusion_use(  # 반복 조회 감사 목적 재사용 — 이 파일도 diffusion과 같은 카운트로 관리
            f"sweep_target_fpr.py ({args.extra_redteam_name})",
            f"{args.track} target_fpr 스윕 {args.extra_redteam_name} 참고용 평가",
            {"checkpoint": os.path.basename(ckpt_path), "split_mode": args.split_mode},
            dataset_path=extra_path, model_checkpoint_path=ckpt_path,
        )

    diff_auc_str = f"{diffusion_auc:.4f}" if diffusion_auc is not None else "n/a"
    rl_auc_str = f"{rl_auc:.4f}" if rl_auc is not None else "n/a"
    extra_auc_str = f"{extra_auc:.4f}" if extra_auc is not None else "n/a"
    print(f"[sweep] threshold-free AUC  general={general_auc:.4f}  diffusion={diff_auc_str}  rl={rl_auc_str}  {args.extra_redteam_name}={extra_auc_str}")

    header = f"{'target_fpr':>10} {'thr':>8} {'gen_H-FPR':>10} {'gen_recall':>10} {'gen_TPR@fpr':>12} " \
             f"{'diff_H-FPR':>10} {'diff_recall':>11} {'diff_TPR@fpr':>13} {'rl_recall':>10} {args.extra_redteam_name+'_recall':>14}"
    print(header)

    human_mask_test = test_source == "human"
    rows = []
    for tf in target_fprs:
        threshold = find_threshold_for_human_fpr(human_val_preds, target_fpr=tf)
        gen_fpr, gen_recall = operating_point_report(test_y, test_preds, threshold)
        gen_tpr_at_fpr = tpr_at_fpr(test_y, test_preds, tf)

        if diff_preds is not None:
            redteam_y = np.concatenate([np.ones(human_mask_test.sum()), np.zeros(len(diff_preds))]).astype(np.float32)
            redteam_preds = np.concatenate([test_preds[human_mask_test], diff_preds])
            diff_fpr, diff_recall = operating_point_report(redteam_y, redteam_preds, threshold)
            diff_tpr_at_fpr = tpr_at_fpr(redteam_y, redteam_preds, tf)
        else:
            diff_fpr = diff_recall = diff_tpr_at_fpr = float("nan")

        if rl_preds is not None:
            rl_y = np.concatenate([np.ones(human_mask_test.sum()), np.zeros(len(rl_preds))]).astype(np.float32)
            rl_full_preds = np.concatenate([test_preds[human_mask_test], rl_preds])
            _, rl_recall = operating_point_report(rl_y, rl_full_preds, threshold)
        else:
            rl_recall = float("nan")

        if extra_preds is not None:
            extra_y = np.concatenate([np.ones(human_mask_test.sum()), np.zeros(len(extra_preds))]).astype(np.float32)
            extra_full_preds = np.concatenate([test_preds[human_mask_test], extra_preds])
            _, extra_recall = operating_point_report(extra_y, extra_full_preds, threshold)
        else:
            extra_recall = float("nan")

        print(
            f"{tf:10.4f} {threshold:8.4f} {gen_fpr:10.4f} {gen_recall:10.4f} {gen_tpr_at_fpr:12.4f} "
            f"{diff_fpr:10.4f} {diff_recall:11.4f} {diff_tpr_at_fpr:13.4f} {rl_recall:10.4f} {extra_recall:14.4f}"
        )
        rows.append({
            "target_fpr": tf, "threshold": float(threshold),
            "gen_Human_FPR": float(gen_fpr), "gen_recall": float(gen_recall), "gen_TPR_at_fpr": float(gen_tpr_at_fpr),
            "diff_Human_FPR": float(diff_fpr), "diff_recall": float(diff_recall), "diff_TPR_at_fpr": float(diff_tpr_at_fpr),
            "rl_recall": float(rl_recall),
            f"{args.extra_redteam_name}_recall": float(extra_recall),
        })

    print("[sweep] 완료 (재학습 없음, diffusion 예측 1회)")

    sweep_report = {
        "checkpoint": os.path.basename(ckpt_path),
        "checkpoint_full_path": ckpt_path,
        "track": args.track, "split_mode": args.split_mode, "preprocessing_mode": args.preprocessing_mode,
        "threshold_free_AUC": {"general": float(general_auc), "diffusion": diffusion_auc, "rl": rl_auc},
        "sweep_rows": rows,
    }
    ckpt_tag = os.path.splitext(os.path.basename(ckpt_path))[0]
    extra_tag = f"_{args.extra_redteam_name}" if args.extra_redteam_file else ""
    out_path = os.path.join(
        REPORT_DIR, f"sweep_{args.track}_{args.split_mode}_{args.preprocessing_mode}_{ckpt_tag}{extra_tag}.json"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sweep_report, f, indent=2, ensure_ascii=False)
    print(f"[sweep] 저장: {out_path}")


if __name__ == "__main__":
    main()
