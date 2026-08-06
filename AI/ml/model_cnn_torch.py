"""
드래그 궤적 사람 vs 봇 판별 CNN — PyTorch 버전 (model_cnn.py의 Keras 구조를 그대로 이식).

원본(Keras, model_cnn.py)과 레이어 구성 1:1 대응:
    Conv1D(32,5) -> BN -> MaxPool(2)
    Conv1D(64,5) -> BN -> MaxPool(2)
    Conv1D(128,3) -> BN -> GlobalAvgPool -> Dropout(0.3)
    (scalar) Dense(16)
    concat -> Dense(64) -> Dropout(0.3) -> Dense(1) -> Sigmoid

입력 shape 주의: Keras는 (N, T, C), PyTorch Conv1d는 (N, C, T)를 기대해서 forward 안에서
permute(0,2,1)로 변환한다 — 호출하는 쪽(seq 배열)은 기존 (N, T, C) 그대로 넘기면 됨.
"""
import torch
import torch.nn as nn


class GradientReversal(torch.autograd.Function):
    """Domain-adversarial 학습용 Gradient Reversal Layer(Ganin & Lempitsky, 2015).
    forward는 항등함수, backward에서 gradient 부호를 뒤집어서 "본체 특징 추출기가 도메인
    (봇 소스) 분류기를 일부러 못 맞히게" 반대로 학습시킨다 — 소스별 특이 지문 의존을 줄여서
    처음 보는 소스(diffusion)로의 전이를 돕자는 실험 기법."""

    @staticmethod
    def forward(ctx, x, lambda_):
        ctx.lambda_ = lambda_
        return x.view_as(x)

    @staticmethod
    def backward(ctx, grad_output):
        return -ctx.lambda_ * grad_output, None


def grad_reverse(x, lambda_=1.0):
    return GradientReversal.apply(x, lambda_)


class DragCaptchaCNN(nn.Module):
    def __init__(self, seq_channels=8, n_scalar=4, dropout=0.3, n_domains=None,
                 pointer_norm_mean=None, pointer_norm_std=None,
                 pointer_thresholds=None, global_threshold=None,
                 scalar_hidden=16):
        super().__init__()
        # 7/29 도입 — pointer 정규화를 모델 안에 내장(baked-in).
        # 기존엔 학습 파이프라인에서 미리 정규화해서 넣었기 때문에, 추론/평가하는 쪽에서도
        # 똑같이 normalize_by_pointer_stats()를 호출해줘야만 정상 동작했다(안 부르면 조용히
        # 성능이 떨어짐 — 실제로 팀 평가 스크립트에서 이 문제가 발생). 이 버퍼가 있으면 모델이
        # forward 안에서 알아서 정규화하므로, 쓰는 쪽은 raw (63,8)만 넣으면 된다.
        # pointer는 scalar 입력의 원핫([waypoint_count, mouse, touch, pen])에서 직접 읽는다.
        if pointer_norm_mean is not None:
            self.register_buffer("pointer_norm_mean", torch.as_tensor(pointer_norm_mean, dtype=torch.float32))
            self.register_buffer("pointer_norm_std", torch.as_tensor(pointer_norm_std, dtype=torch.float32))
        else:
            self.pointer_norm_mean = None
            self.pointer_norm_std = None

        # 7/29 — 운영 threshold도 모델에 내장. calibration.json을 따로 읽어서
        # 적용하는 마지막 수동 단계를 없앤다. pointer_thresholds는 [mouse, touch, pen]
        # 순서(scalar 원핫 순서와 동일), global_threshold는 pointer 미상일 때 fallback.
        if pointer_thresholds is not None:
            self.register_buffer("pointer_thresholds", torch.as_tensor(pointer_thresholds, dtype=torch.float32))
        else:
            self.pointer_thresholds = None
        if global_threshold is not None:
            self.register_buffer("global_threshold", torch.as_tensor(float(global_threshold), dtype=torch.float32))
        else:
            self.global_threshold = None
        self.conv_block = nn.Sequential(
            nn.Conv1d(seq_channels, 32, kernel_size=5, padding=2),
            nn.BatchNorm1d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(2),

            nn.Conv1d(32, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(2),

            nn.Conv1d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
        )
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        self.seq_dropout = nn.Dropout(dropout)

        # scalar_hidden — 8/03 실험용으로 폭을 열어둠(기본 16 = 기존과 동일).
        # 배경: geom 12차원만 쓴 로지스틱 회귀가 CV AUC 0.9927인데 CNN의 lognormal AUC는
        # 0.897이었다(9단계 §4). scalar 19차원을 16으로 눌러 담는 이 한 층이 병목일 수 있다.
        # sigma로 23차원까지 늘렸을 때 오히려 AUC가 0.847로 떨어진 것(10단계)도 같은 방향의
        # 증거 — 차원을 더 넣기 전에 통로부터 넓혀서 확인한다.
        self.scalar_hidden = int(scalar_hidden)
        self.scalar_branch = nn.Sequential(
            nn.Linear(n_scalar, self.scalar_hidden),
            nn.ReLU(inplace=True),
        )

        self.head = nn.Sequential(
            nn.Linear(128 + self.scalar_hidden, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

        # 실험 기능: domain-adversarial 보조 분류기 — "이 특징으로 봇 소스(function/gan/rl)를
        # 맞힐 수 있냐"를 GRL을 통해 반대로 학습시킴. n_domains를 안 주면 아예 안 만듦(기본 동작
        # 변화 없음).
        self.domain_head = None
        if n_domains:
            self.domain_head = nn.Sequential(
                nn.Linear(128 + self.scalar_hidden, 32),
                nn.ReLU(inplace=True),
                nn.Linear(32, n_domains),
            )

    def _apply_pointer_norm(self, seq, scalar):
        """scalar의 pointer 원핫(인덱스 1~3)으로 샘플별 mean/std를 골라 채널 4~7을 z-정규화.

        원핫이 전부 0인(=pointer 미상) 샘플은 mean=0, std=1로 두어 아무 변화 없게 처리한다.
        """
        onehot = scalar[:, 1:4]                                   # (N,3) mouse/touch/pen
        mean = onehot @ self.pointer_norm_mean                    # (N,4)
        std = onehot @ self.pointer_norm_std                      # (N,4)
        missing = (onehot.sum(dim=1, keepdim=True) == 0).float()  # (N,1)
        mean = mean * (1.0 - missing)
        std = std * (1.0 - missing) + missing
        std = std.clamp(min=1e-8)

        head = seq[:, :, :4]
        body = (seq[:, :, 4:8] - mean.unsqueeze(1)) / std.unsqueeze(1)
        tail = seq[:, :, 8:]                                      # 9채널(reversal) 등 나머지 보존
        return torch.cat([head, body, tail], dim=2)

    @torch.no_grad()
    def decide(self, seq, scalar, threshold_override=None):
        """추론 + threshold 적용까지 한 번에. 쓰는 쪽에서 calibration.json을 읽을 필요가 없다.

        반환: dict
          human_prob  (N,) 사람일 확률
          bot_score   (N,) 1 - human_prob  (높을수록 봇 — 기존 DB/UI 스키마와 같은 방향)
          is_human    (N,) bool
          threshold   (N,) 각 샘플에 실제 적용된 threshold

        threshold 선택 순서:
          1) threshold_override 를 주면 그 값(운영 중 운영점을 바꾸고 싶을 때)
          2) pointer_thresholds 가 내장돼 있으면 scalar 원핫으로 pointer별 값 선택
          3) 둘 다 없으면 global_threshold
        pointer 원핫이 전부 0(미상)인 샘플은 자동으로 global_threshold 로 떨어진다.
        """
        self.eval()
        logit = self.forward(seq, scalar)
        if isinstance(logit, tuple):
            logit = logit[0]
        prob = torch.sigmoid(logit)

        if threshold_override is not None:
            thr = torch.full_like(prob, float(threshold_override))
        elif self.pointer_thresholds is not None:
            onehot = scalar[:, 1:4]
            thr = onehot @ self.pointer_thresholds            # (N,)
            missing = onehot.sum(dim=1) == 0
            if missing.any():
                import warnings
                warnings.warn(
                    f"pointer 원핫이 비어 있는 샘플 {int(missing.sum())}개 — scalar를 "
                    "[waypoint_count, mouse, touch, pen] 형식으로 채우지 않으면 pointer별 "
                    "정규화·threshold가 적용되지 않고 global로 떨어집니다.",
                    RuntimeWarning, stacklevel=2,
                )
                if self.global_threshold is None:
                    raise RuntimeError(
                        "pointer 원핫이 비어 있는 샘플이 있는데 global_threshold가 없습니다. "
                        "scalar의 pointer 원핫(인덱스 1~3)을 채워 넣으세요."
                    )
                thr = torch.where(missing, self.global_threshold.expand_as(thr), thr)
        elif self.global_threshold is not None:
            thr = self.global_threshold.expand_as(prob)
        else:
            raise RuntimeError(
                "이 체크포인트에는 threshold가 내장돼 있지 않습니다. "
                "threshold_override 로 직접 넘기거나 calibration.json 값을 쓰세요."
            )

        return {
            "human_prob": prob,
            "bot_score": 1.0 - prob,
            "is_human": prob >= thr,
            "threshold": thr,
        }

    def forward(self, seq, scalar, return_features=False, grl_lambda=None):
        if self.pointer_norm_mean is not None:
            seq = self._apply_pointer_norm(seq, scalar)

        # seq: (N, T, C) -> Conv1d는 (N, C, T) 필요
        x = seq.permute(0, 2, 1)
        x = self.conv_block(x)
        x = self.global_pool(x).squeeze(-1)  # (N, 128)
        x = self.seq_dropout(x)

        s = self.scalar_branch(scalar)  # (N, 16)

        merged = torch.cat([x, s], dim=1)
        logit = self.head(merged).squeeze(-1)  # (N,), 시그모이드 전 로짓

        domain_logit = None
        if self.domain_head is not None and grl_lambda is not None:
            domain_logit = self.domain_head(grad_reverse(merged, grl_lambda))

        if return_features or domain_logit is not None:
            return logit, merged, domain_logit
        return logit


def build_model(seq_len=63, seq_channels=8, n_scalar=4, device="cpu", dropout=0.3, n_domains=None,
                 pointer_norm_stats_path=None, scalar_hidden=16):
    """model_cnn.py의 build_model()과 시그니처 맞춤(seq_len은 안 씀 — Conv1d는 길이 무관).

    dropout: 정규화 강도(기본 0.3, 과적합 완화 실험용으로 조절 가능).
    n_domains: domain-adversarial 실험 켤 때만 정수(봇 소스 개수) 전달, 기본 None=비활성.
    pointer_norm_stats_path: 주면 pointer 정규화를 모델 안에 내장(7/29 도입). 이러면 쓰는 쪽에서
        normalize_by_pointer_stats()를 따로 호출할 필요가 없다 — 체크포인트가 통계를 같이
        들고 다니므로 평가·서빙 코드가 정규화를 빠뜨려도 성능이 조용히 떨어지지 않는다.
    """
    mean = std = None
    if pointer_norm_stats_path:
        import json
        stats = json.load(open(pointer_norm_stats_path, encoding="utf-8"))
        order = ["mouse", "touch", "pen"]  # scalar 원핫 순서와 반드시 일치해야 함
        mean = [stats[p]["mean"] for p in order]
        std = [stats[p]["std"] for p in order]

    model = DragCaptchaCNN(seq_channels=seq_channels, n_scalar=n_scalar, dropout=dropout,
                            n_domains=n_domains, pointer_norm_mean=mean, pointer_norm_std=std,
                            scalar_hidden=scalar_hidden)
    return model.to(device)


def checkpoint_is_baked(checkpoint_path, device="cpu"):
    """체크포인트에 pointer 정규화가 내장돼 있는지만 미리 확인(7/29).

    데이터 로딩 전에 호출해서, baked 모델이면 파이프라인 정규화를 자동으로 끄기 위함 —
    쓰는 쪽에서 --bake_pointer_norm 같은 플래그를 몰라도 되게 한다.
    """
    state = torch.load(checkpoint_path, map_location=device, weights_only=True)
    return "pointer_norm_mean" in state


def load_model_auto(checkpoint_path, device="cpu", dropout=0.3, verbose=True):
    """체크포인트를 열어보고 **모델 구조를 자동으로 맞춰서** 로딩한다(7/29 도입).

    쓰는 쪽에서 seq_channels / n_scalar / n_domains / pointer 정규화 내장 여부를 몰라도 되게
    하는 게 목적. state_dict 안의 키와 shape만 보고 전부 역추론한다:

      · conv_block.0.weight  (32, C, 5)  -> seq_channels = C
      · scalar_branch.0.weight (16, S)   -> n_scalar = S
      · domain_head.2.bias   (D,)        -> n_domains = D (없으면 None)
      · pointer_norm_mean/std 존재 여부   -> pointer 정규화 내장 모델인지

    반환: (model, info dict). model은 eval() 상태.

    ⚠ pointer 정규화가 내장된 모델이면(info["baked_pointer_norm"] == True) 호출하는 쪽에서
    정규화를 **따로 하면 안 된다**(이중 적용됨). raw (N,63,C) 궤적을 그대로 넣으면 된다.
    """
    state = torch.load(checkpoint_path, map_location=device, weights_only=True)

    seq_channels = state["conv_block.0.weight"].shape[1]
    n_scalar = state["scalar_branch.0.weight"].shape[1]
    scalar_hidden = state["scalar_branch.0.weight"].shape[0]   # 8/03 — 폭도 역추론(기존 체크포인트는 16)
    n_domains = state["domain_head.2.bias"].shape[0] if "domain_head.2.bias" in state else None
    baked = "pointer_norm_mean" in state
    mean = state["pointer_norm_mean"] if baked else None
    std = state["pointer_norm_std"] if baked else None

    ptr_thr = state.get("pointer_thresholds")
    glob_thr = state.get("global_threshold")
    baked_threshold = ptr_thr is not None or glob_thr is not None

    model = DragCaptchaCNN(seq_channels=seq_channels, n_scalar=n_scalar, dropout=dropout,
                            n_domains=n_domains, pointer_norm_mean=mean, pointer_norm_std=std,
                            pointer_thresholds=ptr_thr, global_threshold=glob_thr,
                            scalar_hidden=scalar_hidden)
    model.load_state_dict(state)   # strict=True: 조금이라도 안 맞으면 조용히 넘어가지 않고 에러
    model.to(device)
    model.eval()

    info = {
        "seq_channels": int(seq_channels),
        "n_scalar": int(n_scalar),
        "scalar_hidden": int(scalar_hidden),
        "n_domains": int(n_domains) if n_domains is not None else None,
        "baked_pointer_norm": bool(baked),
        "baked_threshold": bool(baked_threshold),
        "pointer_thresholds": [round(float(v), 6) for v in ptr_thr] if ptr_thr is not None else None,
        "global_threshold": round(float(glob_thr), 6) if glob_thr is not None else None,
    }
    if verbose:
        print(f"[load_model_auto] seq_channels={info['seq_channels']} n_scalar={info['n_scalar']} "
              f"n_domains={info['n_domains']} baked_pointer_norm={info['baked_pointer_norm']}")
        if baked:
            print("[load_model_auto] pointer 정규화가 모델에 내장돼 있음 — 입력 전에 따로 정규화하지 마세요.")
        if baked_threshold:
            print(f"[load_model_auto] threshold도 내장돼 있음 — model.decide(seq, scalar)를 쓰면 "
                  f"calibration.json 없이 바로 판정됩니다. (pointer별={info['pointer_thresholds']}, "
                  f"global={info['global_threshold']})")
        else:
            print("[load_model_auto] ⚠ pointer 정규화가 내장돼 있지 않음 — 이 체크포인트가 "
                  "--pointer_norm_stats로 학습된 것이라면, 넣기 전에 normalize_by_pointer_stats()를 "
                  "직접 호출해야 정확한 예측이 나옵니다.")
    return model, info


if __name__ == "__main__":
    m = build_model()
    print(m)
    n_params = sum(p.numel() for p in m.parameters())
    print(f"파라미터 수: {n_params:,}")
