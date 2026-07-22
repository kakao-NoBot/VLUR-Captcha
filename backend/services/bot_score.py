# bot_score.py
# 유형1(type1_drag) 드래그 궤적을 분석해 봇 의심 점수(0~100)를 계산한다.
# 프론트 ticketing-demo-site/src/components/CaptchaDemo.jsx의 computeBotSuspicion()과
# 동일한 가중치로 서버에 포팅한 버전 — 클라이언트가 자기 점수를 조작할 수 없도록
# 원시 포인터 궤적(drag_trace)만 받아 서버에서 직접 산출한다.

import math

SCORE_LOW = 35
SCORE_HIGH = 65


def compute_bot_suspicion(samples: list[dict]) -> dict:
    if len(samples) < 4:
        return {"score": 100, "reasons": ["이동 데이터가 너무 적습니다"]}

    first, last = samples[0], samples[-1]
    duration_ms = max(1, last["t"] - first["t"])

    path_length = 0.0
    speeds = []
    for a, b in zip(samples, samples[1:]):
        dist = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        dt = max(1, b["t"] - a["t"])
        path_length += dist
        speeds.append(dist / dt)

    straight_dist = math.hypot(last["x"] - first["x"], last["y"] - first["y"])
    straightness = (straight_dist / path_length) if path_length > 0 else 1.0
    sample_rate = len(samples) / (duration_ms / 1000)

    mean_speed = sum(speeds) / len(speeds)
    variance = sum((s - mean_speed) ** 2 for s in speeds) / len(speeds)
    speed_cv = (math.sqrt(variance) / mean_speed) if mean_speed > 0 else 0.0

    score = 0
    reasons = []

    if duration_ms < 150:
        score += 30
        reasons.append("드래그 소요 시간이 비정상적으로 짧습니다")
    elif duration_ms < 300:
        score += 12
        reasons.append("드래그 소요 시간이 다소 짧습니다")

    if straightness > 0.94:
        score += 35
        reasons.append("이동 경로가 지나치게 일직선입니다")
    elif straightness > 0.88:
        score += 15
        reasons.append("이동 경로 변화가 적습니다")

    if sample_rate < 18:
        score += 20
        reasons.append("포인터 샘플링 빈도가 비정상적으로 낮습니다")
    elif sample_rate < 30:
        score += 8
        reasons.append("포인터 샘플링 빈도가 다소 낮습니다")

    if speed_cv < 0.12:
        score += 20
        reasons.append("이동 속도가 기계적으로 균일합니다")
    elif speed_cv < 0.25:
        score += 8
        reasons.append("이동 속도 변화가 적습니다")

    if not reasons:
        reasons.append("자연스러운 사람의 드래그 패턴입니다")

    return {"score": min(100, score), "reasons": reasons}
