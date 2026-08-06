"""AI 추론 서비스에 드래그 궤적 분석을 요청하는 backend 클라이언트."""

import math
import os
from typing import Any

import httpx


AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:5000").rstrip("/")
AI_SERVICE_TIMEOUT_SECONDS = float(os.getenv("AI_SERVICE_TIMEOUT_SECONDS", "3.0"))
VALID_TIERS = {"verified", "ambiguous", "blocked"}

_client = httpx.Client(base_url=AI_SERVICE_URL, timeout=AI_SERVICE_TIMEOUT_SECONDS)


def build_record(drag_trace, pointer_type, waypoints, start_center, drop_center) -> dict:
    """프론트 텔레메트리를 AI 서비스가 기대하는 모델 입력 스키마로 변환한다."""
    straight_dist = math.hypot(
        drop_center["x"] - start_center["x"],
        drop_center["y"] - start_center["y"],
    )
    return {
        "points": [{"t": sample["t"], "x": sample["x"], "y": sample["y"]} for sample in drag_trace],
        "device": {"pointerType": pointer_type or "mouse"},
        "task": {
            "taskType": "waypoint_drag",
            "waypointCount": len(waypoints),
            "waypoints": [
                {"x": waypoint["x"], "y": waypoint["y"], "order": index}
                for index, waypoint in enumerate(waypoints)
            ],
            "startCenter": start_center,
            "dropCenter": drop_center,
            "straightDist": max(straight_dist, 1e-6),
        },
        # 전처리기의 스키마 요구사항을 만족시키기 위한 값이며 추론 정답으로 사용하지 않는다.
        "label": "human",
    }


def _blocked_analysis(error: str) -> dict[str, Any]:
    """AI 장애나 잘못된 응답은 인증을 허용하지 않도록 fail-closed 처리한다."""
    return {
        "tier": "blocked",
        "risk_score": 1.0,
        "raw_bot_probability": 1.0,
        "human_probability": 0.0,
        "human_logit": -100.0,
        "is_bot": True,
        "threshold": None,
        "risk_score_threshold": 0.5,
        "risk_score_temperature": None,
        "model_version": "ai-service-unavailable",
        "error": error,
    }


def _validate_analysis(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("AI 응답이 JSON 객체가 아닙니다.")
    if payload.get("tier") not in VALID_TIERS:
        raise ValueError("AI 응답의 tier가 유효하지 않습니다.")
    risk_score = float(payload["risk_score"])
    if not math.isfinite(risk_score) or not 0.0 <= risk_score <= 1.0:
        raise ValueError("AI 응답의 risk_score가 유효하지 않습니다.")
    if not isinstance(payload.get("model_version"), str) or not payload["model_version"]:
        raise ValueError("AI 응답의 model_version이 유효하지 않습니다.")
    payload["risk_score"] = risk_score
    return payload


def classify(record: dict) -> dict[str, Any]:
    try:
        response = _client.post("/v1/classify", json={"record": record})
        response.raise_for_status()
        return _validate_analysis(response.json())
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
        return _blocked_analysis(f"AI 추론 서비스 오류: {exc}")
