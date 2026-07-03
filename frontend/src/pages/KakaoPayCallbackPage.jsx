import React, { useEffect, useState } from 'react';
import api from '../api/axios';

let pendingApprovalKey = null;
let pendingApprovalRequest = null;

function approveOnce(orderId, pgToken) {
  const key = `${orderId}:${pgToken}`;
  if (pendingApprovalKey !== key || !pendingApprovalRequest) {
    pendingApprovalKey = key;
    pendingApprovalRequest = api.post('/payments/kakao/approve', {
      order_id: orderId,
      pg_token: pgToken,
    });
  }
  return pendingApprovalRequest;
}

export default function KakaoPayCallbackPage() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const pathResult = pathParts[2];
  const pathOrderId = pathParts[3];
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order_id') || pathOrderId || localStorage.getItem('kakaopay_order_id');
  const pgToken = params.get('pg_token');
  const [state, setState] = useState({ status: 'loading', message: '결제 결과를 확인하고 있습니다...' });

  useEffect(() => {
    let active = true;
    if (pathResult === 'success') {
      const resolvePayment = async () => {
        let resolvedOrderId = orderId;

        if (!resolvedOrderId) {
          const latest = await api.get('/payments/kakao/latest');
          resolvedOrderId = latest.data.order_id;
          if (latest.data.status === 'paid') {
            return { data: latest.data, orderId: resolvedOrderId };
          }
        }

        if (pgToken) {
          const approved = await approveOnce(resolvedOrderId, pgToken);
          return { data: approved.data, orderId: resolvedOrderId };
        }

        const latest = await api.get('/payments/kakao/latest');
        if (latest.data.order_id !== resolvedOrderId || latest.data.status !== 'paid') {
          throw new Error('결제 승인 상태를 확인할 수 없습니다.');
        }
        return { data: latest.data, orderId: resolvedOrderId };
      };

      resolvePayment()
        .then(({ data, orderId: resolvedOrderId }) => {
          if (!active) return;
          localStorage.setItem('kakaopay_order_id', resolvedOrderId);
          window.history.replaceState({}, '', `/payments/kakao/success/${resolvedOrderId}`);
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
      const result = pathResult === 'cancel' ? 'cancelled' : 'failed';
      if (orderId) {
        api.post('/payments/kakao/close', { order_id: orderId, result }).catch(() => {});
      }
      localStorage.removeItem('kakaopay_order_id');
      setState({
        status: 'error',
        message: result === 'cancelled' ? '결제가 취소되었습니다.' : '결제에 실패했습니다.',
      });
    }

    return () => { active = false; };
  }, [orderId, pathResult, pgToken]);

  return (
    <main className="po-body" style={{ maxWidth: 520, minHeight: '100vh', justifyContent: 'center' }}>
      <h1 className="pg-h1">카카오페이 결제</h1>
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
