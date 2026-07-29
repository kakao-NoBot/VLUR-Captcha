"""
Human + Function + GAN 결합 파이프라인 — canonical_tensor.py 공용 출발점 버전 (7/22, 팀 전처리 통일).

기존 data_pipeline.py(순수), data_pipeline_gan_augmented.py(GAN결합, V1 전용 스케일 보정 포함)를
대체한다. 팀 DIAGNOSIS_AND_ACTIONS.md §4·§7 결정에 따라:
    - 회전정규화 ON, NORMALIZE_ENDPOINT_SCALE=True (canonical_tensor.py 그대로)
    - CNN이 자체로 하던 V1 GAN 전용 포인터별 스케일 보정은 폐기 — canonical_tensor.py가
      이미 전 소스 동일 기준(회전+스케일=1)으로 정규화해서 내보내므로 더 필요 없음.
    - person 분할(Human), hash 분할(Function), 제공 split(GAN) 규칙은 기존과 동일.

한 모델(GAN 포함 여부와 무관하게 항상 Human+Function+GAN 전부)만 만든다 — 팀 문서 §1의
"공식 학습 구성 = Human + Function + GAN"을 그대로 따름. 순수 Function만 보고 싶으면 결과에서
source=='gan' 레코드를 빼고 보면 된다(재학습 불필요).
"""
import hashlib
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "common"))
_PROJECT_ROOT = os.path.dirname(HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from cnn_canonical_features import (  # noqa: E402
    build_lane,
    canonical_to_cnn_sequence,
    canonical_to_scalar_features,
    gan_v1_records_to_cnn,
    gan_v2_records_to_cnn,
    human_or_function_record_to_cnn,
)
from cnn_features_contract_correct import (  # noqa: E402
    human_or_function_to_contract_correct,
    iter_gan_v1_contract_correct,
    iter_gan_v2_contract_correct,
)
from rl_bot_loader import iter_rl_v2_canonical  # noqa: E402
from random_split import assign_record_to_split_random  # noqa: E402
from split_utils import assign_bot_split, assign_record_to_split, load_split_manifest  # noqa: E402

DATASET_DIR = os.path.join(HERE, "..", "dataset")
CONFIG_DIR = os.path.join(HERE, "configs")

KFOLD_K = 5  # train/val/test ~= 3/1/1 = 60/20/20, random_split.py 비율과 맞춤
KFOLD_NAMESPACE = "drag_kfold_v1:"


def _fold_index(capture_id: str, k: int = KFOLD_K) -> int:
    """captureId -> 0..k-1 결정론적 fold 번호 (GAN은 재분할 금지라 여기 안 씀, Human/Function 전용)."""
    digest = hashlib.sha256(f"{KFOLD_NAMESPACE}{capture_id}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % k


def _contract_correct_record_to_cnn(record):
    """B 모드: human_or_function_to_contract_correct() -> (seq, scalar, label). 회전/스케일 강제 없음."""
    canonical = human_or_function_to_contract_correct(record)
    return (
        canonical_to_cnn_sequence(canonical),
        canonical_to_scalar_features(canonical),
        canonical["label"],
    )


def _gan_v1_contract_correct_to_cnn(path):
    for canonical in iter_gan_v1_contract_correct(path):
        split_value = canonical.pop("split")  # 방어적 제거 (cnn_canonical_features.py와 동일 원칙)
        yield (
            canonical_to_cnn_sequence(canonical),
            canonical_to_scalar_features(canonical),
            "bot",
            split_value,
            canonical["pointer_type"],
            canonical["waypoint_count"],
        )


def _gan_v2_contract_correct_to_cnn(path):
    # 공식 V2 어댑터의 canonical_tensor()는 split을 안 돌려줌(V1과 비대칭, 원래 official
    # adapter 자체의 특성) — iter_gan_v2_contract_correct 안에서 raw record 기준으로 split을
    # 같이 실어서 내보내도록 구현되어 있음.
    for canonical, split in iter_gan_v2_contract_correct(path):
        yield (
            canonical_to_cnn_sequence(canonical),
            canonical_to_scalar_features(canonical),
            "bot",
            split,
            canonical["pointer_type"],
            canonical["waypoint_count"],
        )


TRACKS = {
    # v1 제거됨(7/23 팀 결정 — V1 폐기, V2만 공식 트랙). 예전 기록은 git 히스토리/README 참고.
    "v2": {
        "human_file": "human_v2_clean.json",
        "function_file": "bot_function_v2.json",
        "gan_file": "bot_gan_v2_normalized.jsonl",
        "manifest": "person_split_v2.json",
        "function_split_seed": "disc_v2",
        "gan_loader": gan_v2_records_to_cnn,
        "gan_loader_contract_correct": _gan_v2_contract_correct_to_cnn,
        "rl_dir": "rl_bot_v2",  # dataset/rl_bot_v2/ 안의 18개 jsonl(6 lane × 3 split_role)
    },
}


def _hash_input_files(paths):
    """원본 데이터 파일들(human/function/gan)의 결합 해시 — 캐시 자동 무효화용(7/23 도입).
    파일 하나라도 없으면 None 취급해서 해시에 반영(사라진 것도 "변경"으로 감지됨).
    """
    h = hashlib.sha256()
    for p in paths:
        h.update(p.encode("utf-8"))
        if os.path.exists(p):
            with open(p, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
        else:
            h.update(b"__MISSING__")
    return h.hexdigest()


def _load_json(name):
    with open(os.path.join(DATASET_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


def _record_pointer_type(record):
    return record["device"].get("pointerType", "")


def add_reversal_channel(seqs, window=5):
    """(N,63,8) -> (N,63,9). 9번째 채널 = 방향 반전(reversal) 밀도.

    minimum-jerk/lognormal 같은 운동학 합성 봇이 diffusion 급으로 안 잡히는 걸 확인한 뒤(7/25),
    "매끄러움"을 최적화하는 생성기들이 공통으로 놓칠 만한 축으로 추가한 실험 채널. vx,vy(채널
    2,3 — 이미 파생된 값, raw 아님)로 계산: 연속된 두 스텝의 속도 벡터가 90도 넘게 방향이
    꺾이면 "반전"으로 표시하고, 작은 창으로 평활화해서 "이 구간에 방향 반전이 얼마나 조밀하게
    있는지"를 준다. 사람은 미세 보정으로 자연스러운 반전이 있고, 매끄러움 최적화 생성기는
    이게 없거나 부자연스러울 것이라는 가설 — 아직 검증 안 됨, 실험용.

    window: 평활화 창 크기(기본 5). 7/25 실험 결과 hard-negative를 뺀 쪽이 diffusion/kinematic
    AUC와 Human FPR을 동시에 조금씩 개선했음 — 다음 실험은 window 값 자체를 조절해보는 것
    (작을수록 국소적 반전에 민감, 클수록 넓은 구간의 전체적 흔들림에 민감).
    """
    vx, vy = seqs[:, :, 2], seqs[:, :, 3]  # (N,63)
    v = np.stack([vx, vy], axis=-1)  # (N,63,2)
    dots = np.sum(v[:, 1:] * v[:, :-1], axis=-1)  # (N,62)
    norms = np.linalg.norm(v[:, 1:], axis=-1) * np.linalg.norm(v[:, :-1], axis=-1) + 1e-8
    cos_angle = dots / norms
    reversal = (cos_angle < 0).astype(np.float32)  # (N,62)
    reversal = np.concatenate([np.zeros((seqs.shape[0], 1), dtype=np.float32), reversal], axis=1)  # (N,63)

    kernel = np.ones(window, dtype=np.float32) / window
    smoothed = np.apply_along_axis(lambda row: np.convolve(row, kernel, mode="same"), axis=1, arr=reversal)

    return np.concatenate([seqs, smoothed[:, :, None].astype(np.float32)], axis=2)


def load_track_common(track, cache=True, split_mode="person", fold=None, preprocessing_mode="legacy_rotated",
                       add_reversal_channel_flag=False, reversal_window=5):
    """{"train":.., "validation":.., "test":..} 반환.

    각 값은 (seq(N,63,8), scalar(N,4), y, source, lane, pointer, person_id) 7-tuple.
    y: 1.0=human, 0.0=bot(function 또는 gan 구분 없이). source로 세분화 가능.
    person_id: human만 실제 값, function/gan은 빈 문자열("") — person-clustered CI용
    (팀 리뷰 3차: "record는 독립이 아니다, person별 FPR·worst-person FPR 필요").

    split_mode:
        "person" (참고용) — 기존 person-exclusive 분할(person_split_v{1,2}.json).
        "random" (기본, 7/22 팀 결정) — person 구분 없이 captureId 해시로 60/20/20 랜덤 분할.
        "kfold" — 진짜 K-fold 교차검증용. captureId 해시로 Human/Function을 K개 겹치지 않는
                  묶음으로 나누고, `fold`(0..K-1)번째 묶음을 test, 그다음 묶음을 validation,
                  나머지를 train으로 쓴다(회전시키면서 K번 학습하면 완전한 K-fold가 됨).
                  fold를 안 주면 fold=0.
        GAN은 세 모드 다 동일(제공된 split 그대로, 재분할 안 함 — §7.3).

    preprocessing_mode (7/22 팀 리뷰 반영 — A/B 비교용):
        "legacy_rotated" (기본, 지금까지 모든 실험) — canonical_tensor.py의 회전+
            NORMALIZE_ENDPOINT_SCALE=True 적용 ("A").
        "contract_correct" — 팀이 확정한 V1 GAN 원본 계약 그대로(회전 없음, endpoint 강제
            rescale 없음, straightDist 정규화만) ("B"). diffusion recall이 낮은 이유가
            "생성 방식 자체" 때문인지 "우리가 얹은 추가 회전/스케일 정규화" 때문인지 가르기
            위한 비교용.
    """
    if track not in TRACKS:
        raise ValueError(f"알 수 없는 트랙: {track}")
    if split_mode not in ("person", "random", "kfold"):
        raise ValueError(f"알 수 없는 split_mode: {split_mode}")
    if preprocessing_mode not in ("legacy_rotated", "contract_correct"):
        raise ValueError(f"알 수 없는 preprocessing_mode: {preprocessing_mode}")
    cfg = TRACKS[track]
    rev_tag = f"_rev9ch_w{reversal_window}" if add_reversal_channel_flag else ""

    if split_mode == "kfold":
        fold = 0 if fold is None else fold
        cache_path = os.path.join(DATASET_DIR, f"_cache_{track}_common_kfold{fold}_{preprocessing_mode}_v5{rev_tag}.npz")
    else:
        cache_path = os.path.join(DATASET_DIR, f"_cache_{track}_common_{split_mode}_{preprocessing_mode}_v5{rev_tag}.npz")
    # ⚠ 파일명에 _v5 (7/23 4차 반영 — RL 소스 추가로 캐시 스키마가 바뀜).
    # 옛 캐시(_v5 없는 파일명)는 스키마가 안 맞아서 그대로 못 씀 — 자동으로 새로 만들어짐.

    # 7/23 발견된 버그 대응: 캐시 파일명 자체는 원본 데이터 내용(human/function/gan 파일)이
    # 바뀌어도 그대로라 자동 무효화가 안 됐음(person 추가 같은 변경을 못 감지) — 원본 파일들의
    # 해시를 캐시 안에 같이 저장해두고, 다음 로딩 때 지금 파일 해시와 비교해서 다르면 캐시를
    # 무시하고 새로 만든다.
    input_files = [cfg["human_file"], cfg["function_file"], cfg["gan_file"]]
    current_input_hash = _hash_input_files([os.path.join(DATASET_DIR, f) for f in input_files])

    if cache and os.path.exists(cache_path):
        npz = np.load(cache_path, allow_pickle=True)
        cached_hash = str(npz["_input_hash"]) if "_input_hash" in npz.files else None
        if cached_hash == current_input_hash:
            return {
                split: (
                    npz[f"{split}_seq"], npz[f"{split}_scalar"], npz[f"{split}_y"],
                    npz[f"{split}_source"], npz[f"{split}_lane"], npz[f"{split}_pointer"],
                    npz[f"{split}_person_id"],
                )
                for split in ("train", "validation", "test", "diagnostic_redteam_a")
            }
        print(
            f"  [{track}] 캐시가 있지만 원본 데이터 파일이 바뀐 것으로 감지됨(해시 불일치) — "
            "무시하고 새로 만듭니다."
        )

    if split_mode == "person":
        manifest = load_split_manifest(os.path.join(CONFIG_DIR, cfg["manifest"]))

        def human_split_fn(r):
            return assign_record_to_split(r, manifest)
    elif split_mode == "random":
        def human_split_fn(r):
            return assign_record_to_split_random(r)
    else:  # kfold
        test_fold = fold
        val_fold = (fold + 1) % KFOLD_K

        def human_split_fn(r):
            fi = _fold_index(r["captureId"])
            if fi == test_fold:
                return "test"
            if fi == val_fold:
                return "validation"
            return "train"

    hf_record_to_cnn = (
        human_or_function_record_to_cnn if preprocessing_mode == "legacy_rotated"
        else _contract_correct_record_to_cnn
    )
    gan_loader = (
        cfg["gan_loader"] if preprocessing_mode == "legacy_rotated"
        else cfg["gan_loader_contract_correct"]
    )

    humans = _load_json(cfg["human_file"])
    functions = _load_json(cfg["function_file"])

    buckets = {"train": [], "validation": [], "test": [], "diagnostic_redteam_a": []}

    for r in humans:
        split = human_split_fn(r)
        seq, scalar, label = hf_record_to_cnn(r)
        lane = build_lane(0 if _record_pointer_type(r) == "mouse" else (1 if _record_pointer_type(r) == "touch" else 2),
                           int(r["task"].get("waypointCount", 0))) if track == "v2" else ""
        buckets[split].append((seq, scalar, 1.0, "human", lane, _record_pointer_type(r), r.get("personId", "")))
    for r in functions:
        # Function 봇 분할: person 모드는 기존 hash 분할(disc_v1/v2 seed) 유지,
        # random/kfold 모드는 human_split_fn과 같은 규칙(캡처id 해시)을 그대로 적용.
        if split_mode == "person":
            split = assign_bot_split(r["captureId"], seed=cfg["function_split_seed"])
        else:
            split = human_split_fn(r)
        seq, scalar, label = hf_record_to_cnn(r)
        lane = build_lane(0 if _record_pointer_type(r) == "mouse" else (1 if _record_pointer_type(r) == "touch" else 2),
                           int(r["task"].get("waypointCount", 0))) if track == "v2" else ""
        buckets[split].append((seq, scalar, 0.0, "function", lane, _record_pointer_type(r), ""))  # 봇은 personId 없음

    for seq, scalar, label, split, ptr_int, wp_count in gan_loader(os.path.join(DATASET_DIR, cfg["gan_file"])):
        ptr_name = {0: "mouse", 1: "touch", 2: "pen"}.get(ptr_int, "")
        lane = build_lane(ptr_int, wp_count) if track == "v2" else ""
        buckets[split].append((seq, scalar, 0.0, "gan", lane, ptr_name, ""))  # 봇은 personId 없음

    # RL(7/23 신규, V2 전용) — train/development는 train/validation에 합류, diagnostic_redteam_a는
    # 별도 4번째 bucket(사람/함수/GAN의 test와 안 섞임 — diffusion처럼 held-out 취급).
    if cfg.get("rl_dir"):
        rl_dir = os.path.join(DATASET_DIR, cfg["rl_dir"])
        if os.path.isdir(rl_dir):
            for canonical, rl_split, lineage_id in iter_rl_v2_canonical(
                rl_dir, apply_rotation=(preprocessing_mode == "legacy_rotated")
            ):
                seq = canonical_to_cnn_sequence(canonical)
                scalar = canonical_to_scalar_features(canonical)
                ptr_int = canonical["pointer_type"]
                ptr_name = {0: "mouse", 1: "touch", 2: "pen"}.get(ptr_int, "")
                lane = build_lane(ptr_int, canonical["waypoint_count"])
                buckets[rl_split].append((seq, scalar, 0.0, "rl", lane, ptr_name, ""))

    splits = {}
    for split, rows in buckets.items():
        seqs = np.stack([row[0] for row in rows])
        if add_reversal_channel_flag:
            seqs = add_reversal_channel(seqs, window=reversal_window)
        scalars = np.stack([row[1] for row in rows])
        ys = np.array([row[2] for row in rows], dtype=np.float32)
        sources = np.array([row[3] for row in rows])
        lanes = np.array([row[4] for row in rows])
        pointers = np.array([row[5] for row in rows])
        person_ids = np.array([row[6] for row in rows])
        splits[split] = (seqs, scalars, ys, sources, lanes, pointers, person_ids)

    if cache:
        save_kwargs = {}
        for split, (seq, scalar, y, source, lane, pointer, person_id) in splits.items():
            save_kwargs[f"{split}_seq"] = seq
            save_kwargs[f"{split}_scalar"] = scalar
            save_kwargs[f"{split}_y"] = y
            save_kwargs[f"{split}_source"] = source
            save_kwargs[f"{split}_lane"] = lane
            save_kwargs[f"{split}_pointer"] = pointer
            save_kwargs[f"{split}_person_id"] = person_id
        save_kwargs["_input_hash"] = current_input_hash
        np.savez_compressed(cache_path, **save_kwargs)

    return splits


def make_source_balanced_indices(source, ratios=None, rng=None):
    """한 epoch 인덱스를 소스별로 균등 비율로 뽑는다 (복원추출 가능).

    기본 비율: Human 50%, 나머지 50%를 사람이 아닌 소스 전부가 균등 분할. 7/27부터
    function/gan/rl로 하드코딩하지 않고 source에 실제 있는 값을 그대로 씀 — 새 봇 소스
    (예: targeted_evaluator)를 train에 추가해도 코드 수정 없이 자동으로 균등 분할에 들어감.
    """
    if ratios is None:
        available = set(source)
        bot_sources = sorted(available - {"human"})
        each = 0.5 / len(bot_sources) if bot_sources else 0.0
        ratios = {"human": 0.5, **{s: each for s in bot_sources}}
    if rng is None:
        rng = np.random.default_rng(42)

    idx_by_source = {s: np.where(source == s)[0] for s in ratios}
    base_n = len(idx_by_source["human"])
    total_n = int(base_n / ratios["human"])

    chosen = []
    for s, ratio in ratios.items():
        pool = idx_by_source[s]
        if len(pool) == 0:
            continue
        n = int(round(total_n * ratio))
        replace = n > len(pool)
        chosen.append(rng.choice(pool, size=n, replace=replace))
    all_idx = np.concatenate(chosen)
    rng.shuffle(all_idx)
    return all_idx


if __name__ == "__main__":
    from collections import Counter

    for track in TRACKS:
        for mode in ("person", "random"):
            splits = load_track_common(track, cache=True, split_mode=mode)
            print(f"== {track} ({mode}) ==")
            for split, (seq, scalar, y, source, lane, pointer, person_id) in splits.items():
                print(f"  {split}: seq={seq.shape} scalar={scalar.shape} source={dict(Counter(source))}")
