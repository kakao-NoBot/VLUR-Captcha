"""BiLSTM 1단계 — 레코드 로드 → 분할 → 시퀀스 특징 → .npz 캐시.

입력 형태 (PART 2.2 A절, 동일 소스 공용 canonical 기반):
    공용 canonical trajectory (63,2) 변위임의 원점 별 5채널을 만든다.
        [x, y, dx, dy, speed]
        - x,y   : 변위의 누적합(cumsum) = 시작점 기준 절대 위치
        - dx,dy : 변위 그 자체(원 성분)
        - speed : |변위| (스칼라 입력)
    → 타이밍(dt)은 현재 미포함(모양 기반). 2026-07-23 메타부터 GAN·RL에도 dt가 들어와서
      dt 채널 실험이 가능해졌다 → 단 원 타이밍은 사람 train 분포에서 온 것이므로 별도
      실험으로 구분해 기록할 것(BILSTM_GUIDE 참고).
    모든 학습+스케일 정규화된 canonical에서 파생 → 모든 원 소스(human/function/GAN/RL) 동일 의미.

조건 벡터(cond, 시퀀스가 아니라 head에 concat):
    v2: pointerType one-hot(3) + wpCount one-hot(3) → cond_dim 6

레이블: 사람=0, 모든 봇(function/GAN/RL)=1  → "label 원본"이 아니라 **소스(로드)**로 결정.
분할: 사람/함수=captureId 해시 60/20/20 (GAN은 in-record). diffusion은 미포함(별 대비).
→ v2 전용(2026-07-23 방향 전환) → v1 데이터·트랙 폐기됨.

  python3 ml/bilstm/prepare_bilstm_data.py --track v2
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from ml.common.canonical_tensor import human_or_function_to_canonical, apply_endpoint_rotation  # noqa: E402
from ml.common.random_split import split_of  # noqa: E402

SPLIT_NAMES = ("train", "validation", "test")
SOURCES = {
    "v2": {
        "human": "dataset/human_v2_clean.json",
        "function": "dataset/bot_function_v2.json",
        "gan": "dataset/data/bot_gan_v2_temporal_train_only_transfer.jsonl",
        "gan_mod": "ml.common.official_gan_adapters.official_load_gan_supplement_v2_fix1",
        "rl_dir": "dataset/data",
    },
}

# RL(RL_POLICY) 메타부의 split_role → 우리 분할 이름. diagnostic_redteam_a는 학습·검증에
# 절대 쓰이지 않고(원본 설계 존중) 별 대비 평가 전용으로 남긴다.
RL_SPLIT_ROLE = {"train": "train", "development": "validation"}
RL_POINTER = {"mouse": 0, "touch": 1, "pen": 2}


BASIC_FEATURES = ["x", "y", "dx", "dy", "speed"]
RICH_FEATURES = BASIC_FEATURES + ["ax", "ay", "accel_mag", "jerk_mag", "turn"]
LOGNORM_EPS = 1e-6   # log(크기+eps): 정지 샘플(크기 0) -inf 방지. train 표준화가 스케일 흡수.


def variant_tag(features: str, lognormal: bool = False, dt: bool = False, sigma: bool = False) -> str:
    """실험 버전 태그 — 캐시·체크포인트 파일명 구분에 사용(조합별 공존).

    예: basic / rich / rich_lognorm / rich_sigmaln / rich_lognorm_dt. prepare·train·eval이 이
    함수를 공유해 같은 옵션 → 같은 파일명이 되도록 한다(드리프트 방지).
    """
    parts = [features]
    if lognormal:
        parts.append("lognorm")
    if sigma:
        parts.append("sigmaln")
    if dt:
        parts.append("dt")
    return "_".join(parts)


def cache_path(track: str, split: str, tag: str) -> Path:
    return ROOT / "ml" / "bilstm" / f"bilstm_{track}_{split}_{tag}_cache.npz"


def ckpt_path(track: str, split: str, tag: str) -> Path:
    return ROOT / "ml" / "bilstm" / f"bilstm_{track}_{split}_{tag}_ckpt.pt"


def seq_features(canon, rich=False, lognormal=False) -> np.ndarray:
    """canonical dict -> 스텝별 특징 시퀀스.

    basic(5채널): [x, y, dx, dy, speed]  (위치·속도성분·입력)
    rich(10채널) : basic + [ax, ay, accel_mag, jerk_mag, turn]
        - ax,ay     : 가속도 성분(속도의 1차 차분) → 가감·가속 정보
        - accel_mag : |가속도|
        - jerk_mag  : |저크|(가속도의 변화)
        - turn      : 연속 속도벡터 사이 부호있는 방향차(곡률 대용)
    lognormal=True: **크기 채널(speed·accel_mag·jerk_mag)에 log(x+eps) 적용**. 로그정규 변수를
        정규로 돌려 → 사람 입력/가속 크기가 로그정규 형태(운동 속도)라는 신경과학 연구
        (Sigma-Lognormal, 장·의족 등) 가설을 경량 버전. 부호 있는 위치·성분(x,y,dx,dy,ax,ay,
        turn)은 로그 불가라 그대로 둔다. eps는 정지 샘플(크기 0)의 -inf 방지용(train에서 표준화됨).
        » log1p가 아니라 log인 이유: 정규화 변위 크기가 ~0.01–0.03로 작아 log1p는 그 구간에서
          거의 선형(무변화)이 된다. » 이건 "입력 분포의 로그 변환"이지 Sigma-Lognormal 파라미터
          적합(변동·무게)이 아니다.
    → 전부 (63,2) 변위임의 파생 → 동일 원소스·원 소스 동일 의미. 타이밍(dt)은 미포함
      (canonical이 시각지속률 리샘플이라 dt가 균일 → dt_cv 소멸. dt 실험은 표현 변경이 필요).
    """
    disp = np.asarray(canon["trajectory"], dtype=np.float32)          # (63,2) 원(dx,dy)
    pos = np.cumsum(disp, axis=0)                                     # (63,2) x,y
    speed = np.linalg.norm(disp, axis=1, keepdims=True).astype(np.float32)  # (63,1)
    if lognormal:
        speed = np.log(speed + LOGNORM_EPS)                           # 입력 크기만 로그 변환(로그정규→정규)
    if not rich:
        return np.concatenate([pos, disp, speed], axis=1).astype(np.float32)    # (63,5)

    acc = np.vstack([np.zeros((1, 2), np.float32), np.diff(disp, axis=0)]).astype(np.float32)  # (63,2)
    acc_mag = np.linalg.norm(acc, axis=1, keepdims=True).astype(np.float32)
    jerk = np.vstack([np.zeros((1, 2), np.float32), np.diff(acc, axis=0)]).astype(np.float32)
    jerk_mag = np.linalg.norm(jerk, axis=1, keepdims=True).astype(np.float32)
    if lognormal:
        acc_mag = np.log(acc_mag + LOGNORM_EPS); jerk_mag = np.log(jerk_mag + LOGNORM_EPS)  # 가감·저크로
    turn = np.zeros((len(disp), 1), np.float32)
    dot = (disp[:-1] * disp[1:]).sum(1)
    cross = disp[:-1, 0] * disp[1:, 1] - disp[:-1, 1] * disp[1:, 0]
    turn[1:, 0] = np.arctan2(cross, dot).astype(np.float32)           # 부호있는 방향차 대용
    return np.concatenate([pos, disp, speed, acc, acc_mag, jerk_mag, turn], axis=1).astype(np.float32)  # (63,10)


def cond_vector(canon, track: str) -> np.ndarray:
    ptype = int(canon["pointer_type"])
    onehot = np.zeros(3, dtype=np.float32)
    onehot[ptype] = 1.0
    if track == "v2":
        wc = min(int(canon.get("waypoint_count", 0)), 2)
        wch = np.zeros(3, dtype=np.float32)
        wch[wc] = 1.0
        return np.concatenate([onehot, wch])
    return onehot


def build_cond(canon, raw, track, sigma=False, dt=False):
    """cond 벡터 + (옵션) Sigma-Lognormal 4차원(canon 기반) + (옵션) dt 타이밍 4차원(raw 기반).

    - sigma: --lognormal과 무관하게 **원 입력 프로필**로 Sigma-Lognormal 적합(canon에서).
    - dt: **raw 레코드**의 원 타이밍에서 dt_cv 등 전역 요약(⚠ 데이터 소스 별 → dt_leak_ablation.py로 검증).
    raw는 사람/함수/diffusion=수집된 코드(points.t), GAN/RL=메타된 코드(dt 배열) 모두 허용.
    """
    c = cond_vector(canon, track)
    if sigma:
        from ml.bilstm.sigma_lognormal import sigma_features, raw_speed
        c = np.concatenate([c, sigma_features(raw_speed(canon))]).astype(np.float32)
    if dt:
        from ml.bilstm.timing_features import timing_features
        c = np.concatenate([c, timing_features(raw)]).astype(np.float32)
    return c


def cond_with_sigma(canon, track, sigma=False):   # 하위호환 래퍼(dt 없음)
    return build_cond(canon, None, track, sigma=sigma, dt=False)


def build_split_fn(mode, track):
    """분할 모드 → split 함수. 두 버전 지원.

    mode='random'(팀 공용): 원 소스 captureId 해시 60/20/20 (GAN은 in-record). random_split.split_of.
    mode='person'(내 개인 실험): **human만 personId 단위 분할**(person_split_*.json, 사람 겹침 없음 = 누출 방지),
                  function/GAN은 그대로(captureId 해시 / in-record). 팀 공용 규약을 절대 건드림.
    """
    if mode == "random":
        return split_of
    from ml.common.split_utils import load_split_manifest, assign_record_to_split
    manifest = load_split_manifest(ROOT / "ml" / "configs" / f"person_split_{track}.json")

    def person_fn(rec):
        if rec.get("label") == "human":
            return assign_record_to_split(rec, manifest)   # 사람만 personId 분할
        return split_of(rec)                               # function=captureId, GAN=in-record
    return person_fn


def load_human_function(path, label_y, track, split_fn=split_of, rich=False, lognormal=False, sigma=False, dt=False):
    import json
    for rec in json.load(open(ROOT / path)):
        canon = human_or_function_to_canonical(rec)
        yield seq_features(canon, rich, lognormal), build_cond(canon, rec, track, sigma, dt), label_y, split_fn(rec)


def load_gan(path, gan_mod, track, split_fn=split_of, rich=False, lognormal=False, sigma=False, dt=False):
    import importlib
    mod = importlib.import_module(gan_mod)
    for raw in mod.iter_records(str(ROOT / path)):
        canon = apply_endpoint_rotation(mod.canonical_tensor(raw))   # 회전+스케일(래퍼와 동일)
        yield seq_features(canon, rich, lognormal), build_cond(canon, raw, track, sigma, dt), 1, split_fn(raw)  # GAN은 in-record split 존중


def _rl_record_to_canon(r, name):
    """RL_POLICY 레코드 1건 → 회전+스케일 정규화된 canonical. 계약 위반 시 fail-closed."""
    if r.get("dataset_version") != "V2" or r.get("family_id") != "RL_POLICY":
        raise ValueError(f"RL 레코드 계약 위반: {name} version={r.get('dataset_version')} family={r.get('family_id')}")
    traj = np.asarray(r["trajectory"], dtype=np.float32)
    if traj.shape != (63, 2) or not np.isfinite(traj).all():
        raise ValueError(f"RL trajectory 계약 위반: {name} {r.get('record_id', '?')[:12]}")
    return apply_endpoint_rotation({
        "trajectory": traj,
        "pointer_type": RL_POINTER[r["pointer"]],
        "waypoint_count": int(r["waypoint_count"]),
        "label": "bot",
    })


def load_rl(rl_dir, track, rich=False, lognormal=False, sigma=False, dt=False):
    """RL_POLICY 내(2026-07-23 메타, jsonl) 로드. 분할은 in-record split_role을 그대로 존중.

    train_* → train, development_* → validation. diagnostic_redteam_a_* 는 여기서 제외
    (별 대비 평가 전용 → load_rl_redteam). 궤적은 이미 (63,2) normalized_displacement라 회전+스케일만.
    """
    import glob as globlib
    import json
    for path in sorted(globlib.glob(str(ROOT / rl_dir / "*_v2_*_temporal_research.jsonl"))):
        name = Path(path).name
        if name.startswith("diagnostic_redteam"):
            continue
        for line in open(path):
            r = json.loads(line)
            role = RL_SPLIT_ROLE.get(r.get("split_role"))
            if role is None:
                raise ValueError(f"RL split_role 미지원: {name} split_role={r.get('split_role')}")
            canon = _rl_record_to_canon(r, name)
            yield seq_features(canon, rich, lognormal), build_cond(canon, r, track, sigma, dt), 1, role


def load_rl_redteam(rl_dir, track, rich=False, lognormal=False, sigma=False, dt=False):
    """RL 진단 별 대비(diagnostic_redteam_a_v2_*) 로드 → 평가 전용, 학습에 절대 미포함.

    GAN/RL 담당자가 별 대비용으로 정의한 세트. eval에서 두 번째 별 대비으로 사용.
    반환: (feat, cond) — 레이블은 절건 봇(1)이라 호출부에서 부여.
    """
    import glob as globlib
    import json
    for path in sorted(globlib.glob(str(ROOT / rl_dir / "diagnostic_redteam_a_v2_*_temporal_research.jsonl"))):
        name = Path(path).name
        for line in open(path):
            r = json.loads(line)
            canon = _rl_record_to_canon(r, name)
            yield seq_features(canon, rich, lognormal), build_cond(canon, r, track, sigma, dt)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--track", choices=["v2"], default="v2",
                    help="v2 웨이포인트 적용(2026-07-23 방향 전환으로 v1 폐기)")
    ap.add_argument("--split", choices=["random", "person"], default="random",
                    help="random=팀 공용 6:2:2(기본) / person=사람별 분할(내 개인 실험, 누출 없음)")
    ap.add_argument("--features", choices=["basic", "rich"], default="basic",
                    help="basic=5채널[x,y,dx,dy,speed] / rich=10채널(+가감·저크·곡률)")
    ap.add_argument("--lognormal", action="store_true",
                    help="크기 채널(speed·accel·jerk)에 log(x+eps) → 경량 로그정규 변환(별 실험 기록)")
    ap.add_argument("--sigma-lognormal", action="store_true",
                    help="Sigma-Lognormal 적합(신경과학 연구 기반) → SNR·K·μ·σ 4차원을 cond에 추가")
    ap.add_argument("--dt", action="store_true",
                    help="raw 타이밍 요약(dt_cv 등) 4차원을 cond에 추가. ⚠ 데이터 소스 별 → 먼저 "
                         "dt_leak_ablation.py로 검증(측정: dt_cv 단독 사람vs봇 AUC→1.0).")
    ap.add_argument("--out", type=str, default=None)
    args = ap.parse_args()
    src = SOURCES[args.track]
    split_fn = build_split_fn(args.split, args.track)
    rich = args.features == "rich"
    ln = args.lognormal
    sg = args.sigma_lognormal
    dtf = args.dt
    tag = variant_tag(args.features, lognormal=ln, sigma=sg, dt=dtf)
    out = Path(args.out) if args.out else cache_path(args.track, args.split, tag)

    X, C, y, split = [], [], [], []
    src_tag = []
    def collect(gen, tag_):
        n = 0
        for feat, cond, label, sp in gen:
            X.append(feat); C.append(cond); y.append(label); split.append(sp); src_tag.append(tag_); n += 1
        return n

    n_h = collect(load_human_function(src["human"], 0, args.track, split_fn, rich, ln, sg, dtf), "human")
    n_f = collect(load_human_function(src["function"], 1, args.track, split_fn, rich, ln, sg, dtf), "function")
    n_g = collect(load_gan(src["gan"], src["gan_mod"], args.track, split_fn, rich, ln, sg, dtf), "gan")
    n_r = collect(load_rl(src["rl_dir"], args.track, rich, ln, sg, dtf), "rl")

    X = np.stack(X); C = np.stack(C)
    y = np.array(y, dtype=np.int64); split = np.array(split); src_tag = np.array(src_tag)
    np.savez(out, X=X, C=C, y=y, split=split, src=src_tag,
             track=args.track, split_mode=args.split, features=args.features, lognormal=ln, sigma=sg, dt=dtf,
             cond_dim=C.shape[1], in_dim=X.shape[2],
             feature_names=np.array(RICH_FEATURES if rich else BASIC_FEATURES))

    import os
    print(f"[{args.track}/{args.split}/{tag}] 저장 → {os.path.relpath(out, ROOT)}")
    print(f"  X {X.shape}  C {C.shape}  (in_dim {X.shape[2]}, cond_dim {C.shape[1]})")
    print(f"  소스: human {n_h} / function {n_f} / gan {n_g} / rl {n_r}  = 총 {len(y)}")
    print(f"  레이블: 사람(0) {int((y==0).sum())} / 봇(1) {int((y==1).sum())}")
    for sp in SPLIT_NAMES:
        m = split == sp
        print(f"  {sp:11s}: {int(m.sum())} ({m.mean()*100:.1f}%)  "
              f"[사람 {int((m&(y==0)).sum())} / 봇 {int((m&(y==1)).sum())}]  "
              + " ".join(f"{s}={int((m&(src_tag==s)).sum())}" for s in ("human", "function", "gan", "rl")))


if __name__ == "__main__":
    main()
