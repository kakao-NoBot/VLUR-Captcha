"""전체 랜덤 6:2:2 분할 (사람 구분 무시) — captureId 해시 기반, 결정론적.

2026-07-22 팀 결정: **person-exclusive 분할을 폐기하고 전체 레코드를 60/20/20으로 랜덤 분할**한다.
사람(P1,P2,...) 구분을 하지 않는다.

⚠️ 트레이드오프(문서화 목적): 같은 사람의 드래그가 train/test에 동시에 들어갈 수 있다(person
   leakage) → 일반 지표가 실제보다 낙관적으로 나올 수 있음. 팀이 이를 감안하기로 결정.
   근본적 지표 오염 방지는 "사람 제외(신규)"로 별도 지표. 결정론적 시드로 재현·변경 가능.

규칙
    - **사람·함수 내**: 이 모듈은 captureId 해시 60/20/20 사용.
    - **GAN 내**: 계약상 in-record `split` 필드 그대로 사용(재분할 금지). split_of()가 알아서 처리.
    - 결정론적: 같은 captureId는 항상 같은 split. seed로 재현·변경 가능.
"""
from __future__ import annotations

import hashlib

SPLIT_NAMES = ("train", "validation", "test")
DEFAULT_RATIOS = {"train": 0.60, "validation": 0.20, "test": 0.20}
NAMESPACE = "drag_random_split_v1:"
DEFAULT_SEED = "20260722"


def _unit_hash(capture_id: str, seed: str) -> float:
    """captureId(+seed) → [0,1) 결정론적 해시값."""
    digest = hashlib.sha256(f"{NAMESPACE}{seed}:{capture_id}".encode("utf-8")).hexdigest()
    return int(digest[:16], 16) / float(1 << 64)


def assign_record_to_split_random(record: dict, *, seed: str = DEFAULT_SEED, ratios=DEFAULT_RATIOS) -> str:
    """레코드를 captureId 해시로 train/validation/test에 60/20/20 배정(사람 무시)."""
    capture_id = record.get("captureId")
    if not isinstance(capture_id, str) or not capture_id:
        raise ValueError("record에 captureId(str)가 필요합니다.")
    u = _unit_hash(capture_id, seed)
    if u < ratios["train"]:
        return "train"
    if u < ratios["train"] + ratios["validation"]:
        return "validation"
    return "test"


def split_of(record: dict, *, seed: str = DEFAULT_SEED, ratios=DEFAULT_RATIOS) -> str:
    """소스 무관 통합 진입점(관대 버전, 하위호환).

    GAN 내처럼 레코드에 이미 `split` 필드가 박혀 있으면(계약상 재분할 금지) 그 값을 그대로 쓰고,
    그 외(사람/함수 내)는 captureId 해시 랜덤 분할을 적용한다.
    » 더 엄격한 검증을 원하면 `split_for_source(record, source)`를 쓸 것.
    """
    baked = record.get("split")
    if isinstance(baked, str) and baked in SPLIT_NAMES:
        return baked
    return assign_record_to_split_random(record, seed=seed, ratios=ratios)


def split_for_source(record: dict, source: str, *, seed: str = DEFAULT_SEED, ratios=DEFAULT_RATIOS) -> str:
    """source-aware, **fail-closed** 분할. (BiGRU 담당 제안 #2 원본 반영, 2026-07-23)

    - source="gan": **in-record `split` 필수**(계약상 재분할 금지). 없거나 이상하면 에러 → 해시 fallback 금지.
    - source="human"|"function": `split` 필드가 **있으면 에러**(해시 분할 오염 차단), captureId 해시 60/20/20만.
    호출자가 소스를 명시하므로, GAN 레코드의 split 누락 같은 조용한 오분류 요청을 차단한다.
    """
    if source == "gan":
        baked = record.get("split")
        if not (isinstance(baked, str) and baked in SPLIT_NAMES):
            raise ValueError(f"GAN 레코드는 in-record split 필수인데 없음/이상: {baked!r} "
                             f"(captureId={record.get('captureId','?')})")
        return baked
    if source in ("human", "function"):
        if "split" in record:
            raise ValueError(f"human/function 레코드에 'split' 필드 금지(해시 분할 오염): "
                             f"captureId={record.get('captureId','?')}")
        return assign_record_to_split_random(record, seed=seed, ratios=ratios)
    raise ValueError(f"unknown source: {source!r} (human|function|gan 중 하나)")


if __name__ == "__main__":
    import json
    from collections import Counter
    for tag, path in [("v2", "dataset/human_v2_clean.json")]:
        c = Counter(assign_record_to_split_random(r) for r in json.load(open(path)))
        tot = sum(c.values())
        print(f"{tag}: " + "  ".join(f"{k} {c[k]} ({c[k]/tot*100:.1f}%)" for k in SPLIT_NAMES) + f"  / 총 {tot}")
