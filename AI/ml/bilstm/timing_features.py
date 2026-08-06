"""raw 타이밍 → dt 요약 feature. dt "표현 변경"의 권장 구현.

핵심 아이디어: canonical(시각지속률 리샘플)은 dt_cv를 죽이지만, 궤적 표현을 바꾸면(arc-length 등)
velocity 프로필 모양이 달라져 Sigma-Lognormal(sigma) 적합도 흔들린다. 그래서 **궤적 표현은 그대로
두고**(velocity 모양·sigma 보존), **전역 타이밍 신호를 raw에서 직접 뽑아** cond에 추가한다.

소스별 dt 추출 규칙 통일:
    - points[].t 있으면 diff        (사람/함수/diffusion → 원 타임스탬프)
    - dt 배열 있으면 그대로          (GAN/RL → 메타된 소스별 dt)

feature(4차원, [0,1] 스케일):
    [ dt_cv/2, coalesced_ratio, pause_ratio, log1p(duration)/8 ]

⚠ **동시 주의**: 봇의 타이밍은 합성/제어라 dt_cv가 사람과 구조적으로 다를 수 있다(사람의
coalesced 0 버스트로 dt_cv↑). 이건 human-dynamics가 아니라 소스 아티팩트를 잡으면 실전 성능은
무너진다. 반드시 **소스 대응 ablation**(eval의 dt-only AUC)로 검증할 것.
"""
import numpy as np

TIMING_FEAT_DIM = 4


def raw_dt_ms(record) -> np.ndarray:
    """레코드 → 소스별 dt(ms) 배열. 소스 무관 통일 규칙."""
    dt = record.get("dt")
    if isinstance(dt, list) and len(dt) >= 2:
        return np.asarray(dt, dtype=np.float64)
    pts = record.get("points")
    if isinstance(pts, list) and len(pts) >= 2 and isinstance(pts[0], dict) and "t" in pts[0]:
        t = np.asarray([p["t"] for p in pts], dtype=np.float64)
        return np.diff(t)
    return np.array([], dtype=np.float64)


def timing_features(record) -> np.ndarray:
    dt = raw_dt_ms(record)
    dt = dt[np.isfinite(dt)]
    if dt.size < 2:
        return np.zeros(TIMING_FEAT_DIM, dtype=np.float32)
    mean = float(dt.mean())
    med = float(np.median(dt))
    cv = float(dt.std() / mean) if mean > 1e-9 else 0.0
    coalesced = float(np.mean(dt < 1.0))                       # <1ms = 고빈도/coalesced(사람 아티팩트)
    pause = float(np.mean(dt > 3.0 * med)) if med > 0 else 0.0  # 중위값 3배 초과 = 멈칫
    return np.array([
        np.clip(cv / 2.0, 0.0, 1.0),                           # dt_cv (사람↑) → 핵심 신호
        coalesced,
        pause,
        np.clip(np.log1p(float(dt.sum())) / 8.0, 0.0, 1.0),    # log 총 지속시간
    ], dtype=np.float32)
