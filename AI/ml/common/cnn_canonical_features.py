"""
canonical_tensor.py(공용, 회전 통일본)를 공통 출발점으로 쓰는 CNN 전용 피처 변환.

7/22 후 "전처리 통일 패키지"(DIAGNOSIS_AND_ACTIONS.md §4/§7) 반영:
    - 회전 정규화 ON, NORMALIZE_ENDPOINT_SCALE=True를 이미 공통으로 채택.
    - CNN이 자체적으로 하던 V1 GAN 전용 보정(포인터 타입별 지역 재회전, §7/21)은
      "잘못된 전처리"로 지목되어 폐기한다. 이제 V1도 V2도 canonical_tensor.py가 이미
      회전+스케일까지 끝낸 (63,2) 텐서를 그대로 받아서 CNN 입력으로 피처만 만든다.
    - GAN 원래 학습에서는 dt 계열 feature(dt_cv, point_count_norm) 계산 제외
      (GAN은 원시 timestamp 없어서 넣으면 소스 누수) → 이 부분은 기존 결정 유지.

CNN 입력 피처 방법 (7/23 팀 피드백 2건 대응 반영 → 가속도/저크 + 곡률 채널 추가):
    canonical["trajectory"]는 이미 (63,2) 매 스텝 변위(=대략 스텝별 속도 벡터)로 온다.
    - vx, vy = canonical["trajectory"][:, 0], [:, 1]  (스텝별 변위 그대로)
    - dx, dy = cumsum(vx, vy)                          (종단 누적 위치)
    - speed  = ||(vx, vy)||
    - ax, ay = diff(vx, vy)                            (스텝별 가속도 = 속도의 변화량)
    - accel_mag = ||(ax, ay)||
    - jx, jy = diff(ax, ay)                            (스텝별 저크 = 가속도의 변화량)
    - jerk_mag  = ||(jx, jy)||
    - turn_angle = |속도 벡터 방향각의 스텝간 변화량|      (곡률/방향성 채널, BiLSTM 실측
      Cohen's d: mouse 2.19로 사람-diffusion을 가장 잘 가르는 축 중 하나)
    -> (63, 8) = [dx, dy, vx, vy, speed, accel_mag, jerk_mag, turn_angle]. 리샘플이 이미 됐다 →
    canonical 자체가 고정 길이(63)라서 모든 소스가 같은 길이로 나온다.

    ⚠ 이 채널들은 우리가 이미 정규화된 궤적(trajectory)에서 **직접 계산한 파생값**이라, 문서가
    금지한 raw "accel" 필드(원본 기기의 가속도계 값, 존재 여부 자체가 소스를 드러내는 메타데이터)
    와는 다르다 → speed를 넣는 것과 동일한 위치로, 모든 소스(Human/Function/GAN/Diffusion)에
    동일하게 적용되는 물리량 파생이라 금지 대상이 아니다.

스칼라 특징: [waypoint_count, pointerType(mouse/touch/pen) 원핫] 4차원. dt_cv는
GAN이 없는 정보라 여기서 다루지 않는다(§4 규칙 유지).
"""
import sys
from pathlib import Path

import numpy as np

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from ml.common.canonical_tensor import (  # noqa: E402
    apply_endpoint_rotation,
    human_or_function_to_canonical,
)
from ml.common.official_gan_adapters.official_load_gan_supplement_v1 import (  # noqa: E402
    canonical_tensor as _v1_canonical_tensor,
    iter_records as _v1_iter_records,
)
from ml.common.official_gan_adapters.official_load_gan_supplement_v2_fix1 import (  # noqa: E402
    canonical_tensor as _v2_canonical_tensor,
    iter_records as _v2_iter_records,
)

SEQ_LEN = 63  # canonical 텐서 길이 그대로 사용 (리샘플 불필요)
POINTERTYPES = (0, 1, 2)  # canonical_tensor.py 컨벤션: 0=mouse 1=touch 2=pen

# 문서(SHARE_TRAINING_DATA.md §10, SHARED_CANONICAL_TENSOR_CONTRACT.md §5)가 "모델 입력 절대
# 금지"로 명시한 필드들. V1 공용 어댑터의 canonical_tensor()가 "split"을 돌려주는데
# canonical_tensor.py의 회전 어댑터가 이를 그대로 유지시켜 dict에 남았던 것 확인됨(7/22 감사) →
# 실제로 canonical_to_cnn_sequence/scalar_features는 특정 키만 읽어서 모델 입력엔 안 새지만,
# 방어적으로 여기에 한 번 더 막는다(한 공유 파일 canonical_tensor.py는 절대 건드리지 않음).
_FORBIDDEN_MODEL_INPUT_KEYS = {
    "split", "gen", "provenance", "generatorLineage", "checkpointStep",
    "checkpointSha256", "quality_status", "qualityStatus", "seed",
    "captureId", "sample_id", "data_version", "personId", "sessionId",
    "accel", "pressure",  # 7/23 감사 직접 반영 → 문서는 이미 막는다고 했는데 실제로는 빠져있었음
}


def _assert_clean_canonical(canonical: dict, context: str):
    """canonical dict에 금지 필드가 남아있으면 즉시 에러 — 모델 입력으로 넘어가기 전에 막는다."""
    leaked = _FORBIDDEN_MODEL_INPUT_KEYS & set(canonical.keys())
    if leaked:
        raise ValueError(
            f"[{context}] 금지 필드가 canonical dict에 남아있음: {sorted(leaked)} → "
            "모델 입력으로 새기 전에 여기서 막힘. canonical_tensor.py 쪽 원인일 가능성이 높음."
        )


def canonical_to_cnn_sequence(canonical: dict) -> np.ndarray:
    """canonical dict -> (63, 8) CNN 입력 시퀀스 [dx,dy,vx,vy,speed,accel_mag,jerk_mag,turn_angle]."""
    _assert_clean_canonical(canonical, "canonical_to_cnn_sequence")
    traj = np.asarray(canonical["trajectory"], dtype=np.float32)  # (63,2), 이미 회전+스케일 정규화됨
    vx, vy = traj[:, 0], traj[:, 1]
    dx = np.cumsum(vx)
    dy = np.cumsum(vy)
    speed = np.sqrt(vx**2 + vy**2)

    ax = np.diff(vx, prepend=vx[0])
    ay = np.diff(vy, prepend=vy[0])
    accel_mag = np.sqrt(ax**2 + ay**2)

    jx = np.diff(ax, prepend=ax[0])
    jy = np.diff(ay, prepend=ay[0])
    jerk_mag = np.sqrt(jx**2 + jy**2)

    # 곡률/방향성 채널: 속도 벡터 방향각의 스텝간 변화(절대값, -pi~pi로 wrap).
    # BiLSTM 실측(Cohen's d): mouse 2.19로 사람-diffusion을 가르는 핵심 축 중 하나.
    angles = np.arctan2(vy, vx)
    delta_angle = np.diff(angles, prepend=angles[0])
    delta_angle = (delta_angle + np.pi) % (2 * np.pi) - np.pi
    turn_angle = np.abs(delta_angle)

    return np.stack(
        [dx, dy, vx, vy, speed, accel_mag, jerk_mag, turn_angle], axis=-1
    ).astype(np.float32)


def canonical_to_scalar_features(canonical: dict) -> np.ndarray:
    """canonical dict -> (4,) 스칼라 [waypoint_count, pointer_mouse, pointer_touch, pointer_pen]."""
    _assert_clean_canonical(canonical, "canonical_to_scalar_features")
    onehot = [1.0 if canonical["pointer_type"] == p else 0.0 for p in POINTERTYPES]
    waypoint_count = float(canonical.get("waypoint_count", 0))
    return np.array([waypoint_count, *onehot], dtype=np.float32)


def human_or_function_record_to_cnn(record) -> tuple:
    """Human/Function raw record -> (seq(63,8), scalar(4,), label:"human"|"bot")."""
    canonical = human_or_function_to_canonical(record)
    return (
        canonical_to_cnn_sequence(canonical),
        canonical_to_scalar_features(canonical),
        canonical["label"],
    )


def gan_v1_records_to_cnn(path):
    """GAN V1 jsonl -> (seq, scalar, "bot", split, pointer_type, waypoint_count) 이터레이터.

    공식 V1 어댑터의 canonical_tensor()는 split을 같이 반환하는데(V2는 안 그럼 → 비대칭,
    7/22 감사에서 발견), 여기서 pop()으로 뽑아내고 dict에서는 지워서 V2와 동일하게 "split이
    canonical dict에 안 남는" 상태로 맞춘다. 모델 입력 함수(canonical_to_cnn_sequence 등)에는
    금지 필드 방어 체크가 있어서, 이 pop을 빼먹으면 바로 에러가 남(조용히 새지 않음).
    """
    for record in _v1_iter_records(path):
        canonical = apply_endpoint_rotation(_v1_canonical_tensor(record))
        split_value = canonical.pop("split")
        yield (
            canonical_to_cnn_sequence(canonical),
            canonical_to_scalar_features(canonical),
            "bot",
            split_value,
            canonical["pointer_type"],
            canonical["waypoint_count"],
        )


def gan_v2_records_to_cnn(path):
    """GAN V2 jsonl -> (seq, scalar, "bot", split, pointer_type, waypoint_count) 이터레이터.

    공식 V2 어댑터의 canonical_tensor()는 split을 안 돌려주므로(V1과 비대칭— 공식 어댑터
    자체의 특성), raw record에서 직접 읽는다.
    """
    for record in _v2_iter_records(path):
        canonical = apply_endpoint_rotation(_v2_canonical_tensor(record))
        yield (
            canonical_to_cnn_sequence(canonical),
            canonical_to_scalar_features(canonical),
            "bot",
            record["split"],
            canonical["pointer_type"],
            canonical["waypoint_count"],
        )


def build_lane(pointer_type: int, waypoint_count: int) -> str:
    """pointer x waypoint 6-lane 라벨 (V2 breakdown 보고용, 모델 입력 아님)."""
    ptype_name = {0: "mouse", 1: "touch", 2: "pen"}.get(pointer_type, "unknown")
    return f"{ptype_name}_waypoint_{waypoint_count}"
