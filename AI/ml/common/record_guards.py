"""Human/Function 레코드 strict validator — fail-closed. (BiGRU 담당 제안 #1 원본 반영, 2026-07-23)

GAN 공유 어댑터는 이미 fail-closed인데 사람/함수 로딩 경로는 이상 레코드를 조용히 통과시키는
비대칭을 제거한다. canonical 변환 전에 호출해 이상 즉시 중단(RecordValidationError).

차단 케이스: split 필드 존재(해시 분할 오염) / straightDist≤0 / 좌표 NaN·비유한 / points<2 /
             이상 pointerType / label 이상 / V1·V2 혼입(track 주어질 때 taskType 불일치).
"""
from __future__ import annotations

import math

POINTERS = ("mouse", "touch", "pen")


class RecordValidationError(ValueError):
    pass


def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate_human_function_record(record: dict, track: str | None = None) -> None:
    """사람/함수 raw 레코드를 strict 검증. 이상 시 RecordValidationError. 통과 시 None."""
    cid = record.get("captureId", "?")
    if not isinstance(record, dict):
        raise RecordValidationError("record가 dict가 아님")
    # 해시 분할 오염 차단: 사람/함수에 in-record split이 있으면 안 됨(그건 GAN 계약)
    if "split" in record:
        raise RecordValidationError(f"{cid}: human/function은 'split' 필드 금지(해시 분할 오염)")
    if record.get("label") not in ("human", "bot"):
        raise RecordValidationError(f"{cid}: label은 'human'|'bot'이어야 함 (got {record.get('label')!r})")

    task = record.get("task")
    if not isinstance(task, dict):
        raise RecordValidationError(f"{cid}: task 누락")
    sd = task.get("straightDist")
    if not (_finite(sd) and sd > 0):
        raise RecordValidationError(f"{cid}: straightDist는 양의 유한값이어야 함 (got {sd!r})")

    dev = record.get("device")
    if not isinstance(dev, dict) or dev.get("pointerType") not in POINTERS:
        raise RecordValidationError(f"{cid}: pointerType 이상 (got {dev.get('pointerType') if isinstance(dev,dict) else None!r})")

    pts = record.get("points")
    if not isinstance(pts, list) or len(pts) < 2:
        raise RecordValidationError(f"{cid}: points가 2개 미만 (got {len(pts) if isinstance(pts,list) else None})")
    for i, p in enumerate(pts):
        if not (isinstance(p, dict) and _finite(p.get("x")) and _finite(p.get("y")) and _finite(p.get("t"))):
            raise RecordValidationError(f"{cid}: points[{i}] 좌표/시간 비유한(NaN 등)")

    # V1·V2 혼입 방지 (track 주어질 때)
    is_wp = task.get("taskType") == "waypoint_drag"
    if track == "v2" and not is_wp:
        raise RecordValidationError(f"{cid}: v2 트랙인데 taskType!=waypoint_drag (V1 혼입 의심)")
    if track == "v1" and is_wp:
        raise RecordValidationError(f"{cid}: v1 트랙인데 taskType==waypoint_drag (V2 혼입 의심)")
