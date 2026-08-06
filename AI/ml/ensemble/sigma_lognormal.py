"""Sigma-Lognormal 적합 — 선행연구(Plamondon 급속운동 운동학, Acien BeCAPTCHA-Mouse) 정의.

사람 급속운동 속도 프로파일 v(τ)를 K개 로그노멀 스트로크의 합으로 모델링하고 적합한다:
    v(τ) = Σ_i D_i · Λ(τ; t0_i, μ_i, σ_i)
    Λ(τ; t0, μ, σ) = 1 / (σ (τ−t0) √(2π)) · exp(−(ln(τ−t0) − μ)² / (2σ²)),  τ>t0

**속도 크기(magnitude) 버전**: 정식 Sigma-Lognormal은 속도 **벡터**를 방향각(θs,θe)까지 넣어
합하지만, 여기서는 판별 신호의 핵심인 **속도 프로파일 모양**만 잡는 크기 버전을 쓴다(방향각 생략).
canonical은 시간진행률 리샘플이라 dt_cv는 죽지만 v(τ) '모양'은 보존되므로 표현 수정 없이 적합 가능.

feature(전역 요약, 4차원 [0,1] 스케일 → cond 벡터에 concat):
    [ SNR/30, K/3, (μ_w+6)/7.5, σ_w/1.5 ]
    - SNR(dB): 재구성 품질 = "얼마나 로그노멀로 설명되나"(사람↑ 봇↓ 기대) ← 핵심 판별 신호
    - K: 적응 선택된 스트로크 수(1~3) = 운동 복잡도(v2는 경유점 수와 상관)
    - μ_w, σ_w: 진폭(D) 가중 평균 로그시간·로그반응(주 스트로크 모양)

적응 K: K=1,2,3 적합 후 **최고 SNR에서 1 dB 이내인 가장 작은 K**(파시모니 → K가 실제로 변별력).
"""
import warnings

import numpy as np
from scipy.optimize import OptimizeWarning, curve_fit

SQRT2PI = np.sqrt(2.0 * np.pi)
SIGMA_FEAT_DIM = 4        # cond에 붙는 차원
SNR_MARGIN_DB = 1.0       # 적응 K: 최고 SNR에서 이 이내면 더 작은 K 선택


def _stroke(tau, D, t0, mu, sigma):
    dt = tau - t0
    out = np.zeros_like(tau)
    pos = dt > 1e-6
    if np.any(pos):
        z = (np.log(dt[pos]) - mu) / sigma
        out[pos] = D / (sigma * dt[pos] * SQRT2PI) * np.exp(-0.5 * z * z)
    return out


def _model(tau, *p):
    s = np.zeros_like(tau)
    for i in range(len(p) // 4):
        s += _stroke(tau, *p[4 * i:4 * i + 4])
    return s


def _snr_db(v, vhat):
    num = float(np.sum(v * v))
    den = float(np.sum((v - vhat) ** 2)) + 1e-12
    return 10.0 * np.log10(num / den + 1e-12)


def _init_peaks(v, tau, K):
    """v의 상위 봉우리 K개(최소 간격 유지)로 초기 스트로크 위치 추정."""
    sep = max(1, len(v) // (K + 2))
    order = np.argsort(v)[::-1]
    picked = []
    for idx in order:
        if all(abs(int(idx) - j) > sep for _, _, j in picked):
            picked.append((float(tau[idx]), float(v[idx]), int(idx)))
        if len(picked) >= K:
            break
    while len(picked) < K:                       # 분리된 봉우리 부족 시 최대점 재사용
        j = int(np.argmax(v))
        picked.append((float(tau[j]), float(v[j]), j))
    return picked


def _fit_k(v, tau, K):
    p0, lo, hi = [], [], []
    for tp, h, _ in _init_peaks(v, tau, K):
        t0 = tp - 0.08
        mu = float(np.log(max(tp - t0, 1e-3)))
        sigma = 0.3
        D = max(h * sigma * (tp - t0) * SQRT2PI, 1e-6)
        p0 += [D, t0, mu, sigma]
        lo += [0.0, -0.5, -6.0, 0.05]
        hi += [np.inf, 0.98, 1.5, 1.5]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", OptimizeWarning)
        try:
            # trf + 완화된 tolerance + maxfev 제한 = 속도 우선(정밀도는 SNR 판별에 충분).
            popt, _ = curve_fit(_model, tau, v, p0=p0, bounds=(lo, hi),
                                max_nfev=300, ftol=1e-2, xtol=1e-2)
            return np.asarray(popt), _snr_db(v, _model(tau, *popt))
        except Exception:
            p0 = np.asarray(p0)
            return p0, _snr_db(v, _model(tau, *p0))


def sigma_features(speed) -> np.ndarray:
    """속도 프로파일(63,)/(63,1) → 4차원 Sigma-Lognormal 요약 feature([0,1] 스케일).

    적응 K(early-stop): K=1 적합 → K=2가 1dB 이상 개선할 때만 K=3까지. 대부분 1~2에서 멈춰
    적합 횟수를 줄인다(전건 3회 대비 속도↑). 선택 규칙은 동일(최고 SNR에서 1dB 이내 최소 K).
    """
    v = np.asarray(speed, dtype=np.float64).ravel()
    n = len(v)
    if n < 4 or float(v.sum()) < 1e-9:            # 정지/퇴화 → 영벡터
        return np.zeros(SIGMA_FEAT_DIM, dtype=np.float32)
    tau = (np.arange(n) + 0.5) / n

    fits = {1: _fit_k(v, tau, 1)}
    fits[2] = _fit_k(v, tau, 2)
    if fits[2][1] - fits[1][1] >= SNR_MARGIN_DB:  # K=2가 유의미하게 개선할 때만 K=3 시도
        fits[3] = _fit_k(v, tau, 3)
    snr_max = max(s for _, s in fits.values())
    chosen = next(K for K in sorted(fits) if fits[K][1] >= snr_max - SNR_MARGIN_DB)
    popt, snr = fits[chosen]

    P = popt.reshape(-1, 4)
    D = np.clip(P[:, 0], 0, None)
    w = D / (D.sum() + 1e-9)
    mu_w = float((w * P[:, 2]).sum())
    sig_w = float((w * P[:, 3]).sum())
    return np.array([
        np.clip(snr / 30.0, 0.0, 1.0),
        chosen / 3.0,
        np.clip((mu_w + 6.0) / 7.5, 0.0, 1.0),
        np.clip(sig_w / 1.5, 0.0, 1.0),
    ], dtype=np.float32)


def raw_speed(canon) -> np.ndarray:
    """canonical trajectory (63,2) 변위 → 스텝별 속력 크기(63,). Sigma 적합 입력.

    ★ --lognormal(log 변환)과 무관하게 **원시 속력**으로 적합한다(로그노멀 적합은 원 프로파일에)."""
    disp = np.asarray(canon["trajectory"], dtype=np.float64)
    return np.linalg.norm(disp, axis=1)
