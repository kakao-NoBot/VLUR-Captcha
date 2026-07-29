"""
드래그 궤적 사람 vs 봇 판별 CNN — PyTorch 버전 (model_cnn.py의 Keras 구조를 그대로 이식).

원본(Keras, model_cnn.py)과 레이어 구성 1:1 대응:
    Conv1D(32,5) -> BN -> MaxPool(2)
    Conv1D(64,5) -> BN -> MaxPool(2)
    Conv1D(128,3) -> BN -> GlobalAvgPool -> Dropout(0.3)
    (scalar) Dense(16)
    concat -> Dense(64) -> Dropout(0.3) -> Dense(1) -> Sigmoid

입력 shape 주의: Keras는 (N, T, C), PyTorch Conv1d는 (N, C, T)를 기대해서 forward 앞에서
permute(0,2,1)로 변환한다 → 호출하는 쪽(seq 배열)은 기존 (N, T, C) 그대로 넘기면 됨.
"""
import torch
import torch.nn as nn


class GradientReversal(torch.autograd.Function):
    """Domain-adversarial 학습용 Gradient Reversal Layer(Ganin & Lempitsky, 2015).
    forward는 항등함수, backward에서 gradient 부호를 뒤집어서 "특징 추출기가 도메인
    (봇 소스) 분류기를 일부러 못 맞히게" 반대로 학습시킨다 → 소스별 특이 신호 의존을 줄이고
    사람-vs-diffusion으로서 일반화되는 표현을 유도하는 학습 기법."""

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
    def __init__(self, seq_channels=8, n_scalar=4, dropout=0.3, n_domains=None):
        super().__init__()
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

        self.scalar_branch = nn.Sequential(
            nn.Linear(n_scalar, 16),
            nn.ReLU(inplace=True),
        )

        self.head = nn.Sequential(
            nn.Linear(128 + 16, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

        # 실험 기능: domain-adversarial 보조 분류기 — "이 특징으로 봇 소스(function/gan/rl)를
        # 맞힐 수 있는가"를 GRL을 통해 반대로 학습시킴. n_domains를 안 주면 생성 안 함(기본 동작
        # 변화 없음).
        self.domain_head = None
        if n_domains:
            self.domain_head = nn.Sequential(
                nn.Linear(128 + 16, 32),
                nn.ReLU(inplace=True),
                nn.Linear(32, n_domains),
            )

    def forward(self, seq, scalar, return_features=False, grl_lambda=None):
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


def build_model(seq_len=63, seq_channels=8, n_scalar=4, device="cpu", dropout=0.3, n_domains=None):
    """model_cnn.py의 build_model()과 시그니처 맞춤(seq_len은 안 씀 — Conv1d는 길이 무관).

    dropout: 정규화 강도(기본 0.3, 과적합 실험용으로 조정 가능).
    n_domains: domain-adversarial 실험 켤 때만 정수(봇 소스 개수) 전달, 기본 None=비활성.
    """
    model = DragCaptchaCNN(seq_channels=seq_channels, n_scalar=n_scalar, dropout=dropout, n_domains=n_domains)
    return model.to(device)


if __name__ == "__main__":
    m = build_model()
    print(m)
    n_params = sum(p.numel() for p in m.parameters())
    print(f"파라미터 수: {n_params:,}")
