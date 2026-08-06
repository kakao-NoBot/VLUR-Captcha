"""Validated, fail-closed loader for the DATA V2 normalized GAN supplement FIX1."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import numpy as np

from ml.common.gan_supplement_waypoint_contract_fix1 import (
    WaypointContractError,
    canonical_waypoints,
    fixed_waypoint_tensor,
)


REQUIRED = {
    "trajectory", "sequence_length", "pointer_type", "label", "provenance", "split",
    "data_version", "coordinate_space", "sample_id", "generator_lineage", "quality_status",
    "gen", "waypoint_count", "waypoints_normalized", "target_normalized", "waypoint_contract",
}


class GanSupplementV2Fix1Error(ValueError):
    pass


def iter_records(path: str | Path) -> Iterator[dict]:
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise GanSupplementV2Fix1Error(f"invalid JSONL at line {line_no}") from exc
            if not isinstance(value, dict):
                raise GanSupplementV2Fix1Error(f"object required at line {line_no}")
            yield value


def _target(value: object, sample_id: str) -> np.ndarray:
    if not isinstance(value, list) or len(value) != 2 or any(type(v) not in (int, float) or isinstance(v, bool) for v in value):
        raise GanSupplementV2Fix1Error(f"target_normalized contract failed for {sample_id}")
    result = np.asarray(value, dtype=np.float32)
    if result.shape != (2,) or not bool(np.isfinite(result).all()):
        raise GanSupplementV2Fix1Error(f"target_normalized contract failed for {sample_id}")
    return result


def _trajectory(value: object, sample_id: str) -> np.ndarray:
    if not isinstance(value, list) or len(value) != 63:
        raise GanSupplementV2Fix1Error(f"trajectory contract failed for {sample_id}")
    try:
        result = np.asarray(value, dtype=np.float32)
    except (TypeError, ValueError) as exc:
        raise GanSupplementV2Fix1Error(f"trajectory contract failed for {sample_id}") from exc
    if result.shape != (63, 2) or not bool(np.isfinite(result).all()):
        raise GanSupplementV2Fix1Error(f"trajectory contract failed for {sample_id}")
    return result


def canonical_tensor(record: dict) -> dict[str, np.ndarray | int]:
    if set(record) != REQUIRED:
        raise GanSupplementV2Fix1Error("supplement schema keyset failed")
    sample_id = record.get("sample_id")
    if not isinstance(sample_id, str) or not sample_id:
        raise GanSupplementV2Fix1Error("sample_id contract failed")
    if (
        record.get("sequence_length") != 63
        or record.get("data_version") != "DATA_V2"
        or record.get("coordinate_space") != "normalized_displacement"
        or record.get("label") != 1
        or record.get("pointer_type") not in ("mouse", "touch")
        or record.get("provenance") != "BOT_GAN_DATA_V2_RESEARCH_ONLY"
        or record.get("waypoint_contract") != "ordered"
    ):
        raise GanSupplementV2Fix1Error("supplement schema contract failed")
    try:
        count = record["waypoint_count"]
        waypoints = canonical_waypoints(record["waypoints_normalized"], count, sample_id=sample_id)
    except WaypointContractError as exc:
        raise GanSupplementV2Fix1Error(str(exc)) from exc
    target = _target(record["target_normalized"], sample_id)
    trajectory = _trajectory(record["trajectory"], sample_id)
    waypoint_tensor, waypoint_mask, canonical_count = fixed_waypoint_tensor(waypoints, count, sample_id=sample_id)
    return {
        "trajectory": trajectory,
        "pointer_type": 0 if record["pointer_type"] == "mouse" else 1,
        "waypoint_count": canonical_count,
        "waypoints_normalized": waypoints,
        "waypoint_tensor": waypoint_tensor,
        "waypoint_mask": waypoint_mask,
        "target_normalized": target,
        "label": 1,
    }


def boosting_features(record: dict) -> np.ndarray:
    value = canonical_tensor(record)
    tensor = value["trajectory"]
    assert isinstance(tensor, np.ndarray)
    speed = np.linalg.norm(tensor, axis=1)
    jerk = np.linalg.norm(np.diff(tensor, axis=0), axis=1)
    return np.asarray([speed.mean(), speed.std(), speed.sum(), jerk.mean(), jerk.std()], dtype=np.float32)
