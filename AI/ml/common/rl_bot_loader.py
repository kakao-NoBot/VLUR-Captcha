"""
RL bot 데이터 로더 — 7/23 신규 수신(family_id="RL_POLICY"). V2만 지원(V1은 팀 결정으로 폐기).

파일 구성(각 6개 V2 lane: mouse/touch × waypoint_0/1/2):
    train_v2_{lane}_temporal_research.jsonl              -> split_role="train"
    development_v2_{lane}_temporal_research.jsonl        -> split_role="development" (validation 취급)
    diagnostic_redteam_a_v2_{lane}_temporal_research.jsonl -> split_role="diagnostic_redteam_a"
      (diffusion과는 별개의 새 held-out red-team 세트 — RL_POLICY 계열 전용)

trajectory는 이미 (63,2) normalized_displacement(회전 안 됨, straightDist 정규화만) — GAN과
동일한 계약이라 canonical_tensor.py의 apply_endpoint_rotation()을 그대로 재사용한다(재구현 안 함).

⚠ dt/timestamp_rel 필드가 포함된 "temporal" 파일(`bot_gan_v{1,2}_temporal_train_only_transfer
.jsonl`)도 같이 왔는데, `timing_source_mode="train_only_pooled_hierarchical_transfer"`로 봐서
**실제 캡처된 타이밍이 아니라 통계적으로 합성·전이(transfer)된 타이밍**이고, 이름 자체에
"train_only"라고 박혀 있어 val/test에도 똑같이 신뢰성 있게 존재하는지 불확실하다. 섣불리
dt_cv 피처에 섞으면 지금까지 조심해온 것과 같은 종류의 누수가 재발할 위험이 있어서, 이번
구현에는 **포함하지 않았다** — 팀 확인(전체 split에 일관되게 있는지, 실제 타이밍 분포와
얼마나 가까운지) 먼저 받고 나중에 별도로 검토할 것.
"""
import json
import os
import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from ml.common.canonical_tensor import apply_endpoint_rotation  # noqa: E402

_LANES_V2 = [
    "mouse_waypoint_0", "mouse_waypoint_1", "mouse_waypoint_2",
    "touch_waypoint_0", "touch_waypoint_1", "touch_waypoint_2",
]
_POINTER_TO_INT = {"mouse": 0, "touch": 1, "pen": 2}

_SPLIT_ROLE_TO_INTERNAL = {
    "train": "train",
    "development": "validation",
    "diagnostic_redteam_a": "diagnostic_redteam_a",  # 별도 취급 — train/val에 안 섞임
}


def _rl_filename(split_role_file_prefix: str, lane: str) -> str:
    return f"{split_role_file_prefix}_v2_{lane}_temporal_research.jsonl"


def iter_rl_v2_canonical(data_dir: str, apply_rotation: bool = True):
    """RL V2 전체 6-lane × 3-split_role 파일을 순회하며 canonical dict를 낸다.

    반환: (canonical_dict, internal_split, lineage_id) 제너레이터.
    internal_split: "train" | "validation" | "diagnostic_redteam_a"
    """
    for file_prefix, split_role in [
        ("train", "train"), ("development", "development"),
        ("diagnostic_redteam_a", "diagnostic_redteam_a"),
    ]:
        for lane in _LANES_V2:
            path = os.path.join(data_dir, _rl_filename(file_prefix, lane))
            if not os.path.exists(path):
                continue
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    record = json.loads(line)
                    pointer_type = _POINTER_TO_INT.get(record.get("pointer"), 0)
                    canonical = {
                        "trajectory": record["trajectory"],
                        "pointer_type": pointer_type,
                        "waypoint_count": int(record.get("waypoint_count", 0)),
                        "label": "bot",  # record["label"]=="Bot" 값을 신뢰하지 않고 하드코딩(기존 관행)
                    }
                    if apply_rotation:
                        canonical = apply_endpoint_rotation(canonical)
                    internal_split = _SPLIT_ROLE_TO_INTERNAL[record.get("split_role", split_role)]
                    yield canonical, internal_split, record.get("lineage_id", "")
