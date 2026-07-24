"""Validated loader for the DATA V1 normalized GAN supplement.

This is deliberately a supplement adapter, not a raw-record emulator.  It
returns the common [63,2] normalized-displacement tensor contract and retains
audit metadata only outside model-feature dictionaries.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

import numpy as np


REQUIRED = {"trajectory", "sequence_length", "pointer_type", "label", "provenance", "split", "data_version", "coordinate_space", "sample_id", "generator_lineage", "quality_status", "gen"}
FORBIDDEN_MODEL_METADATA = {"sample_id", "data_version", "provenance", "split", "generator_lineage", "quality_status"}


class GanSupplementV1Error(ValueError):
    pass


def iter_records(path: str | Path) -> Iterator[dict]:
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise GanSupplementV1Error(f"invalid JSONL at line {line_no}") from exc
            if not isinstance(value, dict):
                raise GanSupplementV1Error(f"object required at line {line_no}")
            yield value


def canonical_tensor(record: dict) -> dict[str, np.ndarray | int | str]:
    if set(record) != REQUIRED or record.get("sequence_length") != 63 or record.get("data_version") != "DATA_V1" or record.get("coordinate_space") != "normalized_displacement" or record.get("label") != 1:
        raise GanSupplementV1Error("supplement schema contract failed")
    if record.get("pointer_type") not in ("mouse", "touch") or record.get("provenance") != "BOT_GAN_G2_STEP150_RESEARCH_ONLY":
        raise GanSupplementV1Error("pointer or provenance contract failed")
    trajectory = np.asarray(record["trajectory"], dtype=np.float32)
    if trajectory.shape != (63, 2) or not bool(np.isfinite(trajectory).all()):
        raise GanSupplementV1Error("trajectory tensor contract failed")
    return {"trajectory": trajectory, "pointer_type": 0 if record["pointer_type"] == "mouse" else 1, "waypoint_count": 0, "label": 1, "split": str(record["split"])}


def boosting_features(record: dict) -> np.ndarray:
    tensor = canonical_tensor(record)["trajectory"]
    assert isinstance(tensor, np.ndarray)
    speed = np.linalg.norm(tensor, axis=1)
    jerk = np.linalg.norm(np.diff(tensor, axis=0), axis=1)
    return np.asarray([speed.mean(), speed.std(), speed.sum(), jerk.mean(), jerk.std()], dtype=np.float32)
