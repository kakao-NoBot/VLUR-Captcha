"""Fail-closed waypoint canonicalization for the V2 GAN supplement FIX1.

The public JSON contract deliberately preserves zero-waypoint records as an
empty list.  Canonical tensor consumers receive a two-column empty array
instead, so NumPy's default one-dimensional empty-array interpretation can
never leak into a model input.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


BLOCKER = "WAYPOINT_SCHEMA_CONTRACT_BLOCKED"


@dataclass(frozen=True)
class WaypointContractError(ValueError):
    """A coordinate-free failure report suitable for a validation artifact."""

    sample_id: str
    field_path: str
    expected: str
    observed_category: str

    def __str__(self) -> str:
        return (
            f"{BLOCKER}: sample={self.sample_id}; field={self.field_path}; "
            f"expected={self.expected}; observed={self.observed_category}"
        )

    def audit(self) -> dict[str, str]:
        return {
            "blocker_enum": BLOCKER,
            "record_or_sample_id": self.sample_id,
            "normalized_field_path": self.field_path,
            "expected_shape_or_count": self.expected,
            "observed_shape_or_count_category": self.observed_category,
        }


def _fail(sample_id: str, field_path: str, expected: str, observed: str) -> None:
    raise WaypointContractError(sample_id, field_path, expected, observed)


def _count(value: Any, sample_id: str) -> int:
    if type(value) is not int:
        _fail(sample_id, "waypoint_count", "integer in {0,1,2}", "missing_or_non_integer")
    if value not in (0, 1, 2):
        _fail(sample_id, "waypoint_count", "integer in {0,1,2}", "out_of_range")
    return value


def canonical_waypoints(value: Any, waypoint_count: Any, *, sample_id: str = "unknown") -> np.ndarray:
    """Return float32 ``(count, 2)`` waypoints without coercion or repair."""
    count = _count(waypoint_count, sample_id)
    if not isinstance(value, list):
        _fail(sample_id, "waypoints_normalized", f"JSON array length {count}", "missing_or_non_array")
    if len(value) != count:
        _fail(sample_id, "waypoints_normalized", f"JSON array length {count}", "length_mismatch")
    if count == 0:
        # This is the one intentional representation conversion: [] -> (0, 2).
        return np.empty((0, 2), dtype=np.float32)
    rows: list[list[float]] = []
    for row in value:
        if not isinstance(row, list):
            _fail(sample_id, "waypoints_normalized[]", "two-number waypoint", "non_array_waypoint")
        if len(row) != 2:
            _fail(sample_id, "waypoints_normalized[]", "two-number waypoint", "waypoint_length_mismatch")
        if any(type(coord) not in (int, float) or isinstance(coord, bool) for coord in row):
            _fail(sample_id, "waypoints_normalized[]", "two finite numbers", "non_numeric_coordinate")
        arr = np.asarray(row, dtype=np.float32)
        if not bool(np.isfinite(arr).all()):
            _fail(sample_id, "waypoints_normalized[]", "two finite numbers", "non_finite_coordinate")
        rows.append([float(arr[0]), float(arr[1])])
    result = np.asarray(rows, dtype=np.float32)
    if result.shape != (count, 2):
        _fail(sample_id, "waypoints_normalized", f"shape ({count},2)", "canonical_shape_mismatch")
    return result


def serialize_waypoints(value: Any, waypoint_count: Any, *, sample_id: str = "unknown") -> list[list[float]]:
    """Validate an internal array and serialize it back to the exact JSON form."""
    count = _count(waypoint_count, sample_id)
    if not isinstance(value, np.ndarray) or value.dtype.kind not in "fiu":
        _fail(sample_id, "waypoints_normalized", f"internal shape ({count},2)", "non_numeric_tensor")
    if value.shape != (count, 2):
        _fail(sample_id, "waypoints_normalized", f"internal shape ({count},2)", "internal_shape_mismatch")
    if not bool(np.isfinite(value).all()):
        _fail(sample_id, "waypoints_normalized", f"internal finite shape ({count},2)", "internal_non_finite")
    if count == 0:
        return []
    return np.asarray(value, dtype=np.float32).tolist()


def fixed_waypoint_tensor(value: Any, waypoint_count: Any, *, sample_id: str = "unknown") -> tuple[np.ndarray, np.ndarray, int]:
    """Give fixed-size consumers a [2,2] tensor and truthful mask/count.

    Zeros outside the mask are padding only; this helper does not create a
    waypoint and consumers must use the returned mask/count together.
    """
    count = _count(waypoint_count, sample_id)
    array = value if isinstance(value, np.ndarray) else canonical_waypoints(value, count, sample_id=sample_id)
    if array.shape != (count, 2) or not bool(np.isfinite(array).all()):
        _fail(sample_id, "waypoints_normalized", f"internal finite shape ({count},2)", "invalid_internal_tensor")
    tensor = np.zeros((2, 2), dtype=np.float32)
    mask = np.zeros((2,), dtype=np.bool_)
    if count:
        tensor[:count] = array
        mask[:count] = True
    return tensor, mask, count
