"""드래그 궤적 봇 판별 전용 내부 FastAPI 서비스."""

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from AI.services.drag_classifier import MODEL_VERSION, classify


app = FastAPI(
    title="VLUR Drag Bot Classifier",
    description="Backend 전용 드래그 궤적 봇 판별 API",
    version=MODEL_VERSION,
)


class ClassificationRequest(BaseModel):
    record: dict[str, Any]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.post("/v1/classify")
def classify_drag(body: ClassificationRequest) -> dict[str, Any]:
    return classify(body.record)
