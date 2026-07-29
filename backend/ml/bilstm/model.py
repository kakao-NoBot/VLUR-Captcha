"""BiLSTM 드래그 판별 모델 (공용 정의) — train/eval이 함께 import."""
import torch
import torch.nn as nn


class DragBiLSTM(nn.Module):
    """고정 길이(63) 시퀀스 양방향 LSTM → 조건 concat → 로짓 1개.

    입력이 모두 63스텝 고정이라 pack_padded 불필요(패딩/마스킹 없음).
    """
    def __init__(self, in_dim=5, hidden=128, layers=2, cond_dim=3, p=0.3):
        super().__init__()
        self.lstm = nn.LSTM(in_dim, hidden, layers, batch_first=True,
                            bidirectional=True, dropout=p if layers > 1 else 0.0)
        self.head = nn.Sequential(
            nn.Linear(hidden * 2 + cond_dim, 64), nn.ReLU(), nn.Dropout(p),
            nn.Linear(64, 1),
        )

    def forward(self, x, cond):                    # x:(B,63,in_dim)  cond:(B,cond_dim)
        _, (h, _) = self.lstm(x)
        summary = torch.cat([h[-2], h[-1]], dim=1)  # 전/역방향 마지막 hidden 이어붙임 (B, hidden*2)
        return self.head(torch.cat([summary, cond], dim=1)).squeeze(-1)  # (B,) 로짓


def pick_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")
