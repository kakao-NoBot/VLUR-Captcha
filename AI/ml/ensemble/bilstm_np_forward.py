"""BiLSTM 체크포인트의 실제 state_dict를 numpy로 순전파.

체크포인트(`bilstm_v2_person_rich_merged_sigmaln_geom_difftr_kintr_ckpt.pt`)의 실제 텐서
shape을 확인해서 얻은 아키텍처(짐작 아님, 가중치에서 직접 읽음):

    lstm.weight_ih_l0          (512, 10)    -> hidden=128 (4*128=512), in_dim=10
    lstm.weight_hh_l0          (512, 128)
    lstm.weight_ih_l0_reverse  (512, 10)    -> bidirectional
    lstm.weight_ih_l1          (512, 256)   -> layer1 입력 = layer0 양방향 concat(256)
    head.0.weight              (64, 278)    -> 278 = 256(LSTM 최종 hidden, 양방향) + 22(cond)
    head.3.weight              (1, 64)

**attention 파라미터가 state_dict에 없다** — LSTM 뒤에 바로 head가 붙는 구조. 즉 최초 짐작
("LSTM+attention")은 틀렸고, 실제로는 표준 2-layer BiLSTM + 작은 MLP head다. 이 부분은
가중치 shape만으로 확정할 수 있어서 재구현했다.

**아직 확정 못 한 것(가중치 shape으로는 못 감별 — BiLSTM 담당 확인 필요, README.md 참고):**
    1. LSTM 출력을 head에 넣기 전에 어떻게 256차원으로 요약하는지 — 마지막 스텝의
       양방향 hidden state를 이어붙이는 것(`pooling="final_hidden"`, 가장 흔한 방식이라
       기본값으로 둠)인지, 전체 타임스텝 평균/최대 풀링(`pooling="mean"/"max"`)인지.
       파라미터가 없는 연산이라 가중치만 봐서는 구별 불가.
    2. in_dim=10 시퀀스의 정확한 10개 채널 구성과 순서.
    3. cond_dim=22의 정확한 22개 값 구성 순서(pointer_onehot(3)+wc_onehot(3)+geom12+sigma4=22는
       거의 확실하지만 이어붙이는 순서는 모름).
"""
import numpy as np


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _lstm_layer_direction(x, w_ih, w_hh, b_ih, b_hh, reverse=False):
    """x: (N,T,Cin) -> h_seq (N,T,H), h_final (N,H). PyTorch 게이트 순서 i,f,g,o."""
    N, T, Cin = x.shape
    H = w_hh.shape[1]
    h = np.zeros((N, H), dtype=np.float32)
    c = np.zeros((N, H), dtype=np.float32)
    h_seq = np.zeros((N, T, H), dtype=np.float32)
    time_range = range(T - 1, -1, -1) if reverse else range(T)
    for t in time_range:
        xt = x[:, t, :]
        gates = xt @ w_ih.T + b_ih[None, :] + h @ w_hh.T + b_hh[None, :]  # (N, 4H)
        i, f, g, o = np.split(gates, 4, axis=1)
        i = sigmoid(i)
        f = sigmoid(f)
        g = np.tanh(g)
        o = sigmoid(o)
        c = f * c + i * g
        h = o * np.tanh(c)
        h_seq[:, t, :] = h
    return h_seq, h


def bilstm_forward(weights, seq, cond, pooling="final_hidden", n_layers=2):
    """seq: (N,T,in_dim), cond: (N,cond_dim). 반환: P(bot) 또는 P(human) — 학습 라벨 관례에
    따라 다름(README에서 sigmoid 출력의 의미를 BiLSTM 담당에게 확인할 것). 우선 raw sigmoid만
    반환하고 해석은 호출부에서 결정한다."""
    x = seq.astype(np.float32)
    fwd_final = bwd_final = None
    for layer in range(n_layers):
        suf = f"l{layer}"
        w_ih_f = weights[f"lstm.weight_ih_{suf}"]
        w_hh_f = weights[f"lstm.weight_hh_{suf}"]
        b_ih_f = weights[f"lstm.bias_ih_{suf}"]
        b_hh_f = weights[f"lstm.bias_hh_{suf}"]
        w_ih_b = weights[f"lstm.weight_ih_{suf}_reverse"]
        w_hh_b = weights[f"lstm.weight_hh_{suf}_reverse"]
        b_ih_b = weights[f"lstm.bias_ih_{suf}_reverse"]
        b_hh_b = weights[f"lstm.bias_hh_{suf}_reverse"]

        h_seq_f, h_final_f = _lstm_layer_direction(x, w_ih_f, w_hh_f, b_ih_f, b_hh_f, reverse=False)
        h_seq_b, h_final_b = _lstm_layer_direction(x, w_ih_b, w_hh_b, b_ih_b, b_hh_b, reverse=True)
        x = np.concatenate([h_seq_f, h_seq_b], axis=2)  # (N,T,2H) -> 다음 layer 입력
        fwd_final, bwd_final = h_final_f, h_final_b

    if pooling == "final_hidden":
        pooled = np.concatenate([fwd_final, bwd_final], axis=1)  # (N, 2H)
    elif pooling == "mean":
        pooled = x.mean(axis=1)
    elif pooling == "max":
        pooled = x.max(axis=1)
    else:
        raise ValueError(f"unknown pooling: {pooling}")

    merged = np.concatenate([pooled, cond.astype(np.float32)], axis=1)
    h = merged @ weights["head.0.weight"].T + weights["head.0.bias"][None, :]
    h = np.maximum(h, 0)  # ReLU (head.1 자리, dropout은 추론 시 no-op이라 생략)
    logit = (h @ weights["head.3.weight"].T + weights["head.3.bias"][None, :])[:, 0]
    return sigmoid(logit)
