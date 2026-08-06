"""Ultra_CNN_v2 순전파를 numpy로 직접 구현 (torch 불필요).

state_dict(평범한 OrderedDict, pt_loader.load_weights()로 얻음)를 그대로 입력받는다.
torch가 있는 환경에서는 이 모듈 대신 그냥 torch로 원본 모델 클래스를 돌려도 되지만(둘은
수학적으로 동일), 이 구현은 의존성이 numpy 하나뿐이라 서버에 torch/CUDA를 안 깔아도 된다.
"""
import numpy as np


def conv1d_same(x, weight, bias, pad):
    N, Cin, T = x.shape
    Cout, Cin_w, K = weight.shape
    xpad = np.pad(x, ((0, 0), (0, 0), (pad, pad)), mode='constant')
    out = np.zeros((N, Cout, T), dtype=np.float32)
    for k in range(K):
        out += np.einsum('nct,oc->not', xpad[:, :, k:k + T], weight[:, :, k], optimize=True)
    out += bias[None, :, None]
    return out


def batchnorm1d(x, weight, bias, running_mean, running_var, eps=1e-5):
    inv_std = 1.0 / np.sqrt(running_var + eps)
    return (x - running_mean[None, :, None]) * inv_std[None, :, None] * weight[None, :, None] + bias[None, :, None]


def relu(x):
    return np.maximum(x, 0)


def maxpool1d_2(x):
    N, C, T = x.shape
    T2 = (T - 2) // 2 + 1
    out = np.full((N, C, T2), -np.inf, dtype=np.float32)
    for k in range(2):
        seg = x[:, :, k:k + 2 * T2:2]
        out = np.maximum(out, seg)
    return out


def linear(x, weight, bias):
    return x @ weight.T + bias[None, :]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def apply_pointer_norm(seq, scalar, mean, std):
    """scalar[:,1:4] = pointer one-hot(mouse/touch/pen) — 인덱스는 모델 계약상 고정."""
    onehot = scalar[:, 1:4]
    m = onehot @ mean
    s = onehot @ std
    missing = (onehot.sum(axis=1, keepdims=True) == 0).astype(np.float32)
    m = m * (1.0 - missing)
    s = s * (1.0 - missing) + missing
    s = np.clip(s, 1e-8, None)
    head = seq[:, :, :4]
    body = (seq[:, :, 4:8] - m[:, None, :]) / s[:, None, :]
    return np.concatenate([head, body], axis=2)


def forward(weights, seq, scalar, batch_size=4096):
    """seq: (N,63,8), scalar: (N,19). 반환: P(human), shape (N,)."""
    N = seq.shape[0]
    probs = np.zeros(N, dtype=np.float32)
    baked = 'pointer_norm_mean' in weights
    for i in range(0, N, batch_size):
        s = seq[i:i + batch_size]
        sc = scalar[i:i + batch_size]
        if baked:
            s = apply_pointer_norm(s, sc, weights['pointer_norm_mean'], weights['pointer_norm_std'])
        x = np.transpose(s, (0, 2, 1))
        x = conv1d_same(x, weights['conv_block.0.weight'], weights['conv_block.0.bias'], pad=2)
        x = batchnorm1d(x, weights['conv_block.1.weight'], weights['conv_block.1.bias'],
                         weights['conv_block.1.running_mean'], weights['conv_block.1.running_var'])
        x = relu(x)
        x = maxpool1d_2(x)
        x = conv1d_same(x, weights['conv_block.4.weight'], weights['conv_block.4.bias'], pad=2)
        x = batchnorm1d(x, weights['conv_block.5.weight'], weights['conv_block.5.bias'],
                         weights['conv_block.5.running_mean'], weights['conv_block.5.running_var'])
        x = relu(x)
        x = maxpool1d_2(x)
        x = conv1d_same(x, weights['conv_block.8.weight'], weights['conv_block.8.bias'], pad=1)
        x = batchnorm1d(x, weights['conv_block.9.weight'], weights['conv_block.9.bias'],
                         weights['conv_block.9.running_mean'], weights['conv_block.9.running_var'])
        x = relu(x)
        pooled = x.mean(axis=2)
        sb = linear(sc, weights['scalar_branch.0.weight'], weights['scalar_branch.0.bias'])
        sb = relu(sb)
        merged = np.concatenate([pooled, sb], axis=1)
        h = linear(merged, weights['head.0.weight'], weights['head.0.bias'])
        h = relu(h)
        logit = linear(h, weights['head.3.weight'], weights['head.3.bias'])[:, 0]
        probs[i:i + batch_size] = sigmoid(logit)
    return probs
