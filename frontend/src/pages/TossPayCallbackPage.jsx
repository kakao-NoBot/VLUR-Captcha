import React, { useEffect, useState } from 'react';
import api from '../api/axios';

let pendingConfirmKey = null;
let pendingConfirmRequest = null;

function confirmOnce(orderId, paymentKey, amount) {
  const key = `${orderId}:${paymentKey}:${amount}`;
  if (pendingConfirmKey !== key || !pendingConfirmRequest) {
    pendingConfirmKey = key;
    pendingConfirmRequest = api.post('/payments/toss/confirm', {
      order_id: orderId,
      payment_key: paymentKey,
      amount,
    });
  }
  return pendingConfirmRequest;
}

export default function TossPayCallbackPage() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const pathResult = pathParts[2];
  const pathOrderId = pathParts[3];
  const params = new URLSearchParams(window.location.search);
  const orderId = pathOrderId || params.get('orderId') || localStorage.getItem('tosspay_order_id');
  const paymentKey = params.get('paymentKey');
  const amount = Number(params.get('amount'));
  const [state, setState] = useState({
    status: 'loading',
    message: '결제 결과를 확인하고 있습니다...',
  });

  useEffect(() => {
    let active = true;

    if (pathResult === 'success') {
      if (!orderId) {
        setState({ status: 'error', message: '결제 주문번호를 확인할 수 없습니다.' });
        return undefined;
      }

      const request = paymentKey && Number.isInteger(amount) && amount > 0
        ? confirmOnce(orderId, paymentKey, amount)
        : api.get(`/payments/toss/status/${encodeURIComponent(orderId)}`);

      request
        .then(({ data }) => {
          if (!active) return;
          if (data.status !== 'paid') {
            throw new Error('결제 승인 상태를 확인할 수 없습니다.');
          }
          localStorage.setItem('tosspay_order_id', orderId);
          window.history.replaceState({}, '', `/payments/toss/success/${orderId}`);
          setState({
            status: 'success',
            message: `${data.plan_name} 결제가 완료되었습니다. (${Number(data.amount).toLocaleString()}원)`,
          });
        })
        .catch((err) => {
          if (!active) return;
          setState({
            status: 'error',
            message: err.response?.data?.detail || err.message || '결제 승인 중 오류가 발생했습니다.',
          });
        });
    } else {
      const code = params.get('code');
      const tossMessage = params.get('message');
      if (orderId) {
        api.post('/payments/toss/close', {
          order_id: orderId,
          result: 'failed',
        }).catch(() => {});
      }
      localStorage.removeItem('tosspay_order_id');
      setState({
        status: 'error',
        message: tossMessage || (code ? `결제에 실패했습니다. (${code})` : '결제가 취소되었거나 실패했습니다.'),
      });
    }

    return () => { active = false; };
  }, [amount, orderId, pathResult, paymentKey]);

  return (
    <main className="po-body" style={{ maxWidth: 520, minHeight: '100vh', justifyContent: 'center' }}>
      <h1 className="pg-h1">토스페이먼츠 결제</h1>
      <p style={{
        color: state.status === 'success' ? 'var(--ok)' : state.status === 'error' ? '#c0392b' : 'var(--ink-soft)',
        textAlign: 'center',
      }}>
        {state.message}
      </p>
      {state.status !== 'loading' && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button type="button" className="pg-btn primary" onClick={() => window.location.assign('/')}>
            메인으로 돌아가기
          </button>
        </div>
      )}
    </main>
  );
}
