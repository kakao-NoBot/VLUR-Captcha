"""jitter=0.01류 kinematic 봇(sigma-lognormal 계열, CNN·BiLSTM 둘 다 확신에 차서 놓치는 케이스)을
잡기 위한 3번째 경량 보조 탐지기. train_jitter_guard.py가 학습한 로지스틱 회귀
(jitter_guard_weights.json)를 로드해서 cond22(pointer3+wc_onehot3+sigma4+geom12) 기반으로
bot_prob을 낸다.

검증 결과(900건 완전 독립 human held-out + jitter01 test 1,500건):
    threshold=0.5에서 human FPR 0.00%(0/900), jitter01 잔여 위험(기존 둘 다 놓치던 케이스)
    recall 100%(172/172). function/jitter03/kin0 교차 검증도 이상 없음(README 참고).

⚠ 주의: sigma-lognormal 계열(생성기 kinematic_lognormal_v2 및 그 jitter 변형)에 특화된
탐지기입니다. 완전히 다른 새 회피 기법에는 일반화를 보장할 수 없습니다 — CNN/BiLSTM의
대체재가 아니라 "지금 아는 특정 취약점"을 메우는 보조 장치로 취급하세요.
"""
import json
import os

import numpy as np

from .canonical_features import human_or_function_to_canonical_trajectory
from .bilstm_predictor import cond22_from_trajectory

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_PATH = os.path.join(_HERE, "jitter_guard_weights.json")


class JitterGuard:
    def __init__(self, weights_path_or_dict=_DEFAULT_PATH):
        if isinstance(weights_path_or_dict, dict):
            w = weights_path_or_dict
        else:
            w = json.load(open(weights_path_or_dict, encoding="utf-8"))
        self.mu = np.array(w["mu"], dtype=np.float64)
        self.sd = np.array(w["sd"], dtype=np.float64)
        self.coef = np.array(w["coef"], dtype=np.float64)
        self.intercept = float(w["intercept"])
        self.threshold = float(w["aux_threshold"])

    def _prob_from_cond(self, cond):
        x = (np.asarray(cond, dtype=np.float64) - self.mu) / self.sd
        z = float(x @ self.coef + self.intercept)
        return 1.0 / (1.0 + np.exp(-z))

    def predict_record(self, record):
        """반환: bot_prob (0~1). human/function 원본 record(points/task/device) 기준."""
        traj, ptype, wc, _label = human_or_function_to_canonical_trajectory(record)
        cond = cond22_from_trajectory(traj, ptype, wc)
        return self._prob_from_cond(cond)

    def predict_from_trajectory(self, traj, ptype, wc):
        """이미 canonical trajectory/pointer/wc를 갖고 있을 때(GAN/RL 경로 등) 직접 호출용."""
        cond = cond22_from_trajectory(traj, ptype, wc)
        return self._prob_from_cond(cond)

    def predict_from_cond(self, cond):
        """cond22를 이미 계산해둔 경우(예: BiLSTM과 공유) 재계산 없이 바로 씀."""
        return self._prob_from_cond(cond)
