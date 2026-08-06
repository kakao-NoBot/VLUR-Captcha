"""CNN(Ultra_CNN_v2) + BiLSTM 앙상블 predictor.

CNN 쪽은 이 폴더의 CNNPredictor로 실제 추론까지 한다(torch 불필요, 검증 완료).
BiLSTM 쪽은 이 코드에서 직접 돌리지 않는다 — BiLSTM 담당의 모델 클래스 정의 파일이
아직 없어서(체크포인트 안의 가중치 텐서와 cond_dim=22/in_dim=10/hidden=128/layers=2
같은 설정값은 있지만, LSTM+attention을 실제로 조립하는 nn.Module 코드가 없음) 여기서
BiLSTM 순전파를 재구현하면 검증 없이 틀릴 위험이 있다. 대신 BiLSTM 확률을 인자로
받거나 콜백으로 받는 구조로 설계했다 — BiLSTM 담당이 자기 환경(torch 있음)에서 만든
predict 함수를 bilstm_score_fn에 꽂으면 바로 완성된다.

사용법 A — 번들 체크포인트 하나로 끝내기(권장):
    from ensemble_predictor import EnsemblePredictor
    ens = EnsemblePredictor.from_checkpoint("checkpoints/ensemble_checkpoint.pkl")  # ml/ 폴더 안에서 실행 시
    result = ens.predict_record(record)

사용법 B — 개별 파일 3개로(예전 방식, 계속 동작함):
    from cnn_predictor import CNNPredictor
    from bilstm_predictor import BiLSTMPredictor
    bp = BiLSTMPredictor("bilstm_....pt")
    ens = EnsemblePredictor("ultra_cnn_v2_FINAL.pt", bilstm_score_fn=bp)  # bp 객체를 통째로 넘기면
                                                                            # pointer별 threshold까지 정확히 씀
    result = ens.predict_record(record)

사용법 C — BiLSTM 쪽에서 이미 점수를 갖고 있을 때(배치/오프라인 채점, bilstm_preds.csv 조인 등):
    ens = EnsemblePredictor("ultra_cnn_v2_FINAL.pt")
    cnn_out = ens.cnn.predict_record(record)
    result = ens.combine(cnn_out["bot_score"], bilstm_bot_prob)
"""
import json
import os
import pickle

import numpy as np

from .cnn_predictor import CNNPredictor
from .bilstm_predictor import BiLSTMPredictor
from .jitter_guard import JitterGuard

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_WEIGHTS_PATH = os.path.join(_HERE, "combiner_weights.json")
_DEFAULT_JITTER_GUARD_PATH = os.path.join(_HERE, "jitter_guard_weights.json")
_P2IDX = {"mouse": 0, "touch": 1, "pen": 2}


class EnsemblePredictor:
    def __init__(self, cnn, bilstm_score_fn=None, combiner_weights_path=_DEFAULT_WEIGHTS_PATH,
                 jitter_guard="auto"):
        """cnn: .pt 파일 경로(str), 이미 로드된 weights dict, 또는 CNNPredictor 인스턴스.
        bilstm_score_fn: BiLSTMPredictor 인스턴스(권장 — pointer별 threshold까지 정확히 씀)
            또는 record->bot_prob 콜백(threshold는 0.5로 fallback) 또는 None.
        jitter_guard: jitter=0.01류 kinematic 봇 전용 3번째 보조 탐지기(§README jitter=0.01 분석).
            "auto"(기본)면 ml/jitter_guard_weights.json이 있을 때 자동 로드, 없으면 비활성.
            JitterGuard 인스턴스 / 경로(str) / dict / None(명시적으로 끄기)도 가능."""
        self.cnn = cnn if isinstance(cnn, CNNPredictor) else CNNPredictor(cnn)

        if isinstance(bilstm_score_fn, BiLSTMPredictor):
            self.bilstm = bilstm_score_fn
            self.bilstm_score_fn = bilstm_score_fn.predict_record
        else:
            self.bilstm = None
            self.bilstm_score_fn = bilstm_score_fn  # optional: record -> bilstm_bot_prob (0~1)

        if isinstance(combiner_weights_path, dict):
            cw = combiner_weights_path
        else:
            cw = json.load(open(combiner_weights_path, encoding="utf-8"))
        self.mu = cw["mu"]
        self.sd = cw["sd"]
        self.w = cw["w"]
        self.b = cw["b"]
        self.thr_stacking = cw["operating_threshold_stacking_fpr005"]
        self.thr_simple = cw["operating_threshold_simple_avg_fpr005"]

        if isinstance(jitter_guard, JitterGuard):
            self.jitter_guard = jitter_guard
        elif jitter_guard is None:
            self.jitter_guard = None
        elif jitter_guard == "auto":
            self.jitter_guard = JitterGuard(_DEFAULT_JITTER_GUARD_PATH) if os.path.exists(_DEFAULT_JITTER_GUARD_PATH) else None
        else:  # 경로(str) 또는 dict
            self.jitter_guard = JitterGuard(jitter_guard)

    @classmethod
    def from_checkpoint(cls, path):
        """ml/checkpoints/ensemble_checkpoint.pkl 하나로 CNN+BiLSTM+결합기(+jitter_guard 있으면 그것도)
        전부 로드. 원본 .pt 파일 3개(ultra_cnn_v2_FINAL.pt, bilstm_....pt, combiner_weights.json)
        없이도 동작."""
        with open(path, "rb") as f:
            bundle = pickle.load(f)
        cnn = CNNPredictor(bundle["cnn_weights"])
        bilstm = BiLSTMPredictor(bundle["bilstm_bundle"])
        jg = bundle.get("jitter_guard")  # 번들에 있으면 씀, 없으면 로컬 파일 자동 탐색(하위호환)
        jitter_guard = jg if jg is not None else "auto"
        return cls(cnn, bilstm_score_fn=bilstm, combiner_weights_path=bundle["combiner"], jitter_guard=jitter_guard)

    @classmethod
    def from_torch_checkpoint(cls, path):
        """배포용 ensemble_checkpoint.pt에서 전체 앙상블을 안전하게 복원한다."""
        import torch

        bundle = torch.load(path, map_location="cpu", weights_only=True)
        required = {"cnn_state_dict", "bilstm_state_dict", "combiner", "jitter_guard", "meta"}
        missing = required.difference(bundle)
        if missing:
            raise ValueError(f"앙상블 체크포인트 필수 항목이 없습니다: {sorted(missing)}")

        def to_numpy_dict(state_dict):
            return {
                key: value.detach().cpu().numpy() if isinstance(value, torch.Tensor) else value
                for key, value in state_dict.items()
            }

        meta = bundle["meta"]
        cnn_weights = to_numpy_dict(bundle["cnn_state_dict"])
        cnn_weights["pointer_thresholds"] = np.asarray(
            meta["cnn_pointer_thresholds"], dtype=np.float32
        )
        cnn_weights["global_threshold"] = float(meta["cnn_global_threshold"])

        bilstm_bundle = {
            "weights": to_numpy_dict(bundle["bilstm_state_dict"]),
            "seq_mu": np.asarray(meta["bilstm_seq_mu"], dtype=np.float32),
            "seq_sd": np.asarray(meta["bilstm_seq_sd"], dtype=np.float32),
            "threshold_by_pointer": meta["bilstm_threshold_by_pointer"],
            "threshold_global": meta["bilstm_threshold_global"],
        }
        return cls(
            CNNPredictor(cnn_weights),
            bilstm_score_fn=BiLSTMPredictor(bilstm_bundle),
            combiner_weights_path=bundle["combiner"],
            jitter_guard=bundle["jitter_guard"],
        )

    def combine(self, cnn_bot_score, bilstm_bot_prob, method="or_rule", cnn_bot_threshold=0.5, bilstm_bot_threshold=0.5,
                aux_bot_score=None, aux_bot_threshold=None):
        """두 모델(+선택적으로 jitter_guard 3번째 투표)의 bot 확률 -> 앙상블 결과 dict.

        method:
            "or_rule"(기본, 권장) — 셋 중 하나라도 자기 threshold를 넘으면 봇 판정.
                stacking/simple_average는 human+function+gan(둘 다 이미 잘 막는 쉬운 클래스)
                에서 fit해서, "CNN은 사람이라 하는데 BiLSTM은 봇"처럼 갈리는 경우 —
                바로 kin_lognormal이 그런 경우다(§3.2) — CNN 쪽이 과도하게 눌러버리는
                게 실측으로 확인됨(README §한계). 앙상블을 하는 이유 자체가 "한쪽이
                놓쳐도 한쪽이 잡는다"이므로, 보안 목적엔 OR 규칙이 더 맞다.
            "stacking" — fit된 로지스틱 결합기(CNN+BiLSTM 2개만). human/function/gan에서
                AUC 1.0000로 가장 정확하지만, 위 이유로 kin_lognormal류 불일치 상황엔
                과신하지 말 것. jitter_guard는 이 방식엔 반영 안 됨(or_rule 전용).
            "simple_average" — CNN+BiLSTM 단순평균, 참고용. jitter_guard 반영 안 됨.

        aux_bot_score/aux_bot_threshold: jitter_guard(있으면)의 bot_prob과 threshold.
            or_rule에서만 3번째 투표로 반영됨(§README jitter=0.01 분석 — 900건 held-out
            human FPR 0.00%, jitter01 잔여 위험 recall 100% 확인된 threshold=0.5 기본값).
        """
        simple_avg = (cnn_bot_score + bilstm_bot_prob) / 2.0

        x0 = (cnn_bot_score - self.mu[0]) / self.sd[0]
        x1 = (bilstm_bot_prob - self.mu[1]) / self.sd[1]
        z = self.w[0] * x0 + self.w[1] * x1 + self.b
        stacking = 1.0 / (1.0 + pow(2.718281828459045, -z))

        # OR 규칙: 각 모델을 "자기 threshold"로 독립 판정한 뒤, 하나라도 봇이라 하면 봇.
        # cnn_bot_threshold 기본값 0.5는 pointer 정보가 없을 때의 fallback일 뿐 — CNNPredictor로
        # 뽑은 점수라면 predict_record()가 실제 pointer별 threshold(1 - human_prob 기준으로 환산)를
        # 넘겨주므로 여기서 정확한 값이 쓰인다.
        cnn_flag = cnn_bot_score > cnn_bot_threshold
        bilstm_flag = bilstm_bot_prob > bilstm_bot_threshold
        aux_flag = aux_bot_score is not None and aux_bot_threshold is not None and aux_bot_score > aux_bot_threshold
        or_rule_hit = cnn_flag or bilstm_flag or aux_flag
        or_rule_score = max(cnn_bot_score, bilstm_bot_prob, aux_bot_score if aux_bot_score is not None else 0.0)

        if method == "simple_average":
            score, thr, is_bot = simple_avg, self.thr_simple, simple_avg > self.thr_simple
        elif method == "stacking":
            score, thr, is_bot = stacking, self.thr_stacking, stacking > self.thr_stacking
        else:  # or_rule — 점수가 아니라 "셋 중 하나라도 걸렸는가"로 직접 판정
            score, thr, is_bot = or_rule_score, max(cnn_bot_threshold, bilstm_bot_threshold), or_rule_hit

        return {
            "cnn_bot_score": cnn_bot_score,
            "bilstm_bot_score": bilstm_bot_prob,
            "jitter_guard_bot_score": aux_bot_score,
            "simple_average": simple_avg,
            "stacking_score": stacking,
            "or_rule_score": or_rule_score,
            "ensemble_bot_score": score,
            "method": method,
            "operating_threshold": thr,
            "is_bot": is_bot,
        }

    def predict_record(self, record, bilstm_bot_prob=None, method="or_rule", bilstm_bot_threshold=None,
                        use_jitter_guard=True):
        cnn_out = self.cnn.predict_record(record)
        # CNNPredictor가 이미 pointer별 threshold로 계산해둔 human_prob 기준 threshold를
        # bot_score(=1-human_prob) 공간으로 환산해서 OR-rule에 그대로 쓴다.
        cnn_bot_threshold = 1.0 - cnn_out["threshold"]

        aux_bot_score = aux_bot_threshold = None
        use_aux = use_jitter_guard and self.jitter_guard is not None

        # BiLSTM과 jitter_guard 둘 다 내부적으로 cond22(sigma-lognormal curve_fit 포함, 레코드당
        # 제일 느린 부분)를 계산한다. bilstm_bot_prob를 호출자가 이미 안 넘겨줬고 self.bilstm이
        # 실제 BiLSTMPredictor 인스턴스면, cond를 한 번만 계산해서 둘이 나눠 쓴다(2배 느려지는 것 방지).
        if bilstm_bot_prob is None and self.bilstm is not None and use_aux:
            from .canonical_features import human_or_function_to_canonical_trajectory
            from .bilstm_predictor import cond22_from_trajectory
            traj, ptype, wc, _lbl = human_or_function_to_canonical_trajectory(record)
            cond = cond22_from_trajectory(traj, ptype, wc)
            bilstm_bot_prob = self.bilstm.predict_record(record, _traj_cond=(traj, cond))
            aux_bot_score = self.jitter_guard.predict_from_cond(cond)
        else:
            if bilstm_bot_prob is None:
                if self.bilstm_score_fn is None:
                    raise ValueError(
                        "bilstm_bot_prob를 안 주면 bilstm_score_fn 콜백이 등록돼 있어야 합니다. "
                        "BiLSTM 쪽 모델 클래스가 아직 이 폴더에 없어서 자동으로는 못 돌립니다 — README.md 참고."
                    )
                bilstm_bot_prob = self.bilstm_score_fn(record)
            if use_aux:
                aux_bot_score = self.jitter_guard.predict_record(record)

        if bilstm_bot_threshold is None:
            # self.bilstm(BiLSTMPredictor 인스턴스)이 있으면 pointer별 실제 threshold를 쓰고,
            # 콜백만 있을 땐(threshold 정보가 없으므로) 0.5로 fallback.
            if self.bilstm is not None and self.bilstm.threshold_by_pointer is not None:
                idx = _P2IDX.get(cnn_out["pointer_type"])
                bilstm_bot_threshold = float(
                    self.bilstm.threshold_by_pointer.get(idx, self.bilstm.threshold_global or 0.5)
                ) if idx is not None else float(self.bilstm.threshold_global or 0.5)
            else:
                bilstm_bot_threshold = 0.5

        if use_aux:
            aux_bot_threshold = self.jitter_guard.threshold

        result = self.combine(
            cnn_out["bot_score"], bilstm_bot_prob, method=method,
            cnn_bot_threshold=cnn_bot_threshold, bilstm_bot_threshold=bilstm_bot_threshold,
            aux_bot_score=aux_bot_score, aux_bot_threshold=aux_bot_threshold,
        )
        result["cnn_pointer_type"] = cnn_out["pointer_type"]
        return result
