"""
타겟 봇 합성 — Captcha-Security-Evaluator(팀 CAPTCHA를 실제로 노리는 자체 개발 봇)의
경로 생성 알고리즘(v1/src/captcha_evaluator/path.py `curved_route_through`)을 그대로
재현한다. 실제 사이트에 Playwright로 봇을 돌릴 필요 없이, 알고리즘만 가져와서 사람 실제
태스크(시작·경유점·목표) 위에 대량 생성 — kinematic_synth.py와 동일한 접근.

⚠ kinematic_synth.py(학술적 생성기)와 성격이 다르다 — 이건 "미지의 미래 공격"이 아니라
"우리 팀 CAPTCHA를 정조준한, 지금 실재하는 공격"이다. 그래서 이 데이터는 diffusion/kinematic
과 달리 **학습에 넣는 것도 합리적인 선택지**다(팀 논의 필요 — 이전에 "diffusion을 학습에
넣을지" 논의했던 것과 같은 성격의 결정이니 혼자 결정하지 말 것).

원본 알고리즘(curved_segment): 구간마다 진행방향에 수직으로 curve_offset만큼 랜덤 오프셋된
control point 하나로 2차 베지어, smoothstep(t*t*(3-2t)) 이징 적용. steps_per_segment=20,
curve_offset_min_px=10~curve_offset_max_px=28, pause_at_checkpoint_ms=120이 evaluator
config.example.json 기본값.

python3 ml/targeted_evaluator_synth.py --n 10000 --out dataset/bot_targeted_evaluator_v2.json
"""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def curved_segment(start, end, steps, rng, curve_offset_min_px, curve_offset_max_px):
    """원본 path.py의 curved_segment()를 그대로 재현(좌표만 튜플로, Point 클래스 없이)."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    distance = math.hypot(dx, dy)
    if distance == 0:
        return [end] * steps

    offset = rng.uniform(curve_offset_min_px, curve_offset_max_px)
    offset *= rng.choice((-1.0, 1.0))
    px, py = -dy / distance, dx / distance
    control = ((start[0] + end[0]) / 2 + px * offset, (start[1] + end[1]) / 2 + py * offset)

    result = []
    for index in range(1, steps + 1):
        raw_t = index / steps
        t = raw_t * raw_t * (3 - 2 * raw_t)  # smoothstep
        inv = 1 - t
        result.append((
            inv * inv * start[0] + 2 * inv * t * control[0] + t * t * end[0],
            inv * inv * start[1] + 2 * inv * t * control[1] + t * t * end[1],
        ))
    result[-1] = end
    return result


def route_through_linear(points, steps_per_segment):
    """원본 path.py의 route_through() 재현 — 단순 직선 보간, 곡선 없음(진짜 다른 알고리즘)."""
    route = [points[0]]
    for start, end in zip(points, points[1:]):
        for index in range(1, steps_per_segment + 1):
            t = index / steps_per_segment
            route.append((start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t))
    return route


def curved_route_through(points, steps_per_segment, seed, curve_offset_min_px, curve_offset_max_px):
    """원본 curved_route_through() 재현."""
    rng = random.Random(seed)
    route = [points[0]]
    for start, end in zip(points, points[1:]):
        route.extend(curved_segment(start, end, steps_per_segment, rng, curve_offset_min_px, curve_offset_max_px))
    return route


def make_record(src_task, ptype, rng, steps_per_segment, curve_offset_min_px, curve_offset_max_px,
                 pause_at_checkpoint_ms, mode="curved"):
    start = src_task["startCenter"]
    drop = src_task["dropCenter"]
    wps = sorted(src_task.get("waypoints", []), key=lambda w: w.get("order", 0))
    anchors = [(start["x"], start["y"])] + [(w["x"], w["y"]) for w in wps] + [(drop["x"], drop["y"])]
    straight_dist = max(float(src_task.get("straightDist", math.hypot(anchors[-1][0] - anchors[0][0],
                                                                        anchors[-1][1] - anchors[0][1]))), 1e-6)

    if mode == "linear":
        route = route_through_linear(anchors, steps_per_segment)
    else:
        seed = rng.randint(0, 2**31 - 1)
        route = curved_route_through(anchors, steps_per_segment, seed, curve_offset_min_px, curve_offset_max_px)

    # 타이밍: 원본 evaluator는 Playwright mouse.move()로 스텝마다 실제 걸리는 시간(가변) +
    # 체크포인트마다 pause_at_checkpoint_ms 정지. 정확한 프레임 타이밍은 재현 불가능하니(브라우저
    # 이벤트 루프 의존적) 균등 간격 + 체크포인트 정지만 근사— 저희 canonical 전처리는 progress
    # 기준 리샘플이라 어차피 정밀 dt는 안 씀, 좌표(공간 경로)가 핵심이라 이 정도로 충분.
    per_step_ms = 1000.0 / steps_per_segment * (straight_dist / max(len(anchors) - 1, 1)) / 200.0
    per_step_ms = max(8.0, min(per_step_ms, 40.0))
    points = []
    t = 0.0
    for i, (x, y) in enumerate(route):
        points.append({"x": float(x), "y": float(y), "t": float(t)})
        t += per_step_ms
        if pause_at_checkpoint_ms > 0 and i > 0 and i % steps_per_segment == 0:
            t += pause_at_checkpoint_ms

    return {
        "label": "bot",
        "generator_version": f"targeted_evaluator_{mode}_v1",
        "device": {"pointerType": ptype},
        "task": {
            "taskType": "waypoint_drag",
            "straightDist": straight_dist,
            "waypointCount": len(wps),
            "waypoints": [{"x": float(w["x"]), "y": float(w["y"]), "order": int(w.get("order", k))}
                          for k, w in enumerate(wps)],
            "dropCenter": {"x": float(drop["x"]), "y": float(drop["y"])},
            "startCenter": {"x": float(start["x"]), "y": float(start["y"])},
        },
        "points": points,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=10000, help="생성 개수")
    ap.add_argument("--source", type=str, default="dataset/human_v2_clean.json",
                     help="태스크(시작·경유점·목표)를 빌려올 실제 데이터")
    ap.add_argument("--out", type=str, default=None)
    ap.add_argument("--mode", choices=["curved", "linear"], default="curved",
                     help="linear=원본 evaluator의 다른 모드(제어점 곡선 없음, 진짜 다른 알고리즘)")
    ap.add_argument("--steps_per_segment", type=int, default=20, help="evaluator config 기본값")
    ap.add_argument("--curve_offset_min_px", type=float, default=10.0)
    ap.add_argument("--curve_offset_max_px", type=float, default=28.0)
    ap.add_argument("--pause_at_checkpoint_ms", type=float, default=120.0)
    ap.add_argument("--seed", type=int, default=20260727)
    args = ap.parse_args()
    rng = random.Random(args.seed)
    out = Path(args.out) if args.out else ROOT / "dataset" / "bot_targeted_evaluator_v2.json"

    src = json.load(open(ROOT / args.source))
    tasks = [(r["task"], r.get("device", {}).get("pointerType", "mouse"))
              for r in src if r.get("task", {}).get("taskType") == "waypoint_drag"
              and r.get("task", {}).get("startCenter") and r.get("task", {}).get("dropCenter")]
    if not tasks:
        print("[중단] source에서 waypoint_drag 태스크를 찾지 못함")
        sys.exit(1)
    print(f"태스크 풀 {len(tasks)}개에서 {args.n}건 생성 (targeted evaluator {args.mode}) …")

    records = []
    for _ in range(args.n):
        task, ptype = tasks[rng.randrange(len(tasks))]
        rec = make_record(task, ptype, rng, args.steps_per_segment, args.curve_offset_min_px,
                           args.curve_offset_max_px, args.pause_at_checkpoint_ms, mode=args.mode)
        records.append(rec)

    json.dump(records, open(out, "w"))
    import os
    print(f"저장 → {os.path.relpath(out, ROOT)}  ({len(records)}건)")
    print(f"  generator_version=targeted_evaluator_{args.mode}_v1 · pointerType는 원본 태스크 따름")
    print("  → 레드팀 평가: --extra_redteam_file " + os.path.relpath(out, ROOT).replace("dataset/", ""))


if __name__ == "__main__":
    main()
