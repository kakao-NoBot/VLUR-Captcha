// PlanPayPage.jsx

import React, { useState } from 'react';
import api from '../api/axios';
import EmailInput from '../components/EmailInput';

/* ── 스텝 인디케이터 원형 배지 ── */
function StepCircle({ state, index }) {
  const base = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'all .2s',
    boxSizing: 'border-box',
  };

  if (state === 'done') {
    return (
      <div style={{
        ...base,
        background: 'linear-gradient(135deg, var(--orange), var(--gold))',
        color: '#fff',
        border: 'none',
        boxShadow: '0 2px 6px rgba(240,105,30,.35)',
      }}>
        <svg viewBox="0 0 24 24" fill="none" width={15} height={15}>
          <path d="M5 12.5 9.5 17 19 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (state === 'active') {
    return (
      <div style={{
        ...base,
        background: 'var(--card)',
        color: 'var(--orange)',
        border: '2px solid var(--orange)',
        boxShadow: '0 0 0 4px rgba(240,105,30,.12)',
      }}>
        {index}
      </div>
    );
  }

  return (
    <div style={{
      ...base,
      background: 'var(--paper)',
      color: 'var(--muted)',
      border: '1.5px solid var(--line)',
    }}>
      {index}
    </div>
  );
}

const PLANS = {
  Basic: { name: 'Basic 요금제', price: '0', raw: 0, vat: 0, total: '0', features: '✓ 월 100,000 호출\n✓ API Key 1개\n✓ CAPTCHA 유형 1·2 지원', isFree: true, comparePrice: '89,000' },
  Pro: { name: 'Pro 요금제', price: '89,000', raw: 89000, vat: 0, total: '89,000', features: '✓ 월 500,000 호출\n✓ API Key 최대 5개\n✓ 대시보드 분석 (30일)' },
  Enterprise: { name: 'Enterprise 요금제', price: '문의', raw: 0, vat: 0, total: '문의', features: '✓ 무제한 호출\n✓ SLA 99.9%\n✓ 전담 매니저' },
};

export default function PlanPayPage({ planName = 'Pro', initialSuccess = false, closePage, openPage, openMypageOnApiKey, user }) {
  const plan = PLANS[planName] || PLANS.Pro;
  const [method, setMethod] = useState('kakao');
  const [buyerName, setBuyerName] = useState(user?.user_name || '');
  const [buyerEmail, setBuyerEmail] = useState(user?.email || '');
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail.trim());
  const [steps, setSteps] = useState(null); // null | [{label, state}]
  const [success, setSuccess] = useState(initialSuccess);
  const [paymentError, setPaymentError] = useState('');

  const kakaoSteps = [
    '준비 요청 — POST /api/payments/kakao/ready',
    '카카오페이 인증 페이지 이동 (next_redirect_pc_url)',
    'pg_token 수신 — 서버 Approve API 호출 중…',
    '결제 승인 완료 · Pro 요금제 활성화',
  ];
  const tossSteps = [
    '주문 생성 — POST /api/payments/toss/ready',
    '표준 결제창 SDK v2 — payment.requestPayment()',
    'successUrl 수신 · paymentKey/amount 검증 · Confirm API',
    '결제 승인 완료 · Pro 요금제 활성화',
  ];
  const stepLabels = method === 'kakao' ? kakaoSteps : tossSteps;

  // ── 상단 진행 스텝(1~4) 상태 계산 ──
  // 1: 요금제 선택 — 이 페이지에 왔다는 것 자체로 항상 완료
  // 2: 결제 수단 선택 — 이 페이지에 왔다는 것 자체로 항상 완료(체크마크)
  // 3: 결제 인증 — 실제로 결제 버튼을 눌러 요청이 시작된 뒤(steps 존재)에만 active, 그 전엔 pending
  // 4: 요금제 활성화 — success가 되어야 done
  const progressSteps = (() => {
    if (success) {
      return [
        { label: '요금제 선택', state: 'done' },
        { label: '결제 수단 선택', state: 'done' },
        { label: '결제 인증', state: 'done' },
        { label: '요금제 활성화', state: 'done' },
      ];
    }
    if (steps) {
      return [
        { label: '요금제 선택', state: 'done' },
        { label: '결제 수단 선택', state: 'done' },
        { label: '결제 인증', state: 'active' },
        { label: '요금제 활성화', state: 'pending' },
      ];
    }
    return [
      { label: '요금제 선택', state: 'done' },
      { label: '결제 수단 선택', state: 'done' },
      { label: '결제 인증', state: 'pending' },
      { label: '요금제 활성화', state: 'pending' },
    ];
  })();

  const startFreePlan = async () => {
    if (!localStorage.getItem('access_token')) {
      openPage('login');
      return;
    }
    setPaymentError('');
    try {
      await api.post('/payments/free/activate');
      setSuccess(true);
    } catch (err) {
      setPaymentError(err.response?.data?.detail || 'Basic 요금제 활성화에 실패했습니다.');
    }
  };

  const startPayment = async () => {
    if (!localStorage.getItem('access_token')) {
      openPage('login');
      return;
    }
    const initial = stepLabels.map((label, i) => ({ label, state: i === 0 ? 'active' : 'pending' }));
    setSteps(initial);
    setPaymentError('');
    try {
      if (method === 'kakao') {
        const { data } = await api.post('/payments/kakao/ready', { plan_name: planName });
        setSteps(stepLabels.map((label, index) => ({
          label,
          state: index === 0 ? 'done' : index === 1 ? 'active' : 'pending',
        })));
        localStorage.setItem('kakaopay_order_id', data.order_id);
        window.location.assign(data.redirect_url);
        return;
      }

      if (typeof window.TossPayments !== 'function') {
        throw new Error('토스페이먼츠 SDK를 불러오지 못했습니다.');
      }

      const { data } = await api.post('/payments/toss/ready', { plan_name: planName });
      localStorage.setItem('tosspay_order_id', data.order_id);
      setSteps(stepLabels.map((label, index) => ({
        label,
        state: index === 0 ? 'done' : index === 1 ? 'active' : 'pending',
      })));

      const tossPayments = window.TossPayments(data.client_key);
      const payment = tossPayments.payment({ customerKey: data.customer_key });
      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: data.amount },
        orderId: data.order_id,
        orderName: data.order_name,
        successUrl: data.success_url,
        failUrl: data.fail_url,
        customerEmail: buyerEmail.trim(),
        ...(buyerName.trim() ? { customerName: buyerName.trim() } : {}),
        windowTarget: 'self',
      });
    } catch (err) {
      setSteps(null);
      setPaymentError(
        err.response?.data?.detail
          || err.message
          || `${method === 'kakao' ? '카카오페이' : '토스페이먼츠'} 결제를 시작하지 못했습니다.`
      );
    }
  };

  return (
    <div className="po-body" style={{ maxWidth: 700 }}>
      {/* Plan summary */}
      <div className="plan-pay-summary" style={plan.isFree ? { color: '#fff' } : {}}>
        <div>
          <div className="pps-badge" style={plan.isFree ? { color: '#fff', opacity: 0.85 } : {}}>선택하신 요금제</div>
          <div className="pps-name" style={plan.isFree ? { color: '#fff' } : {}}>{plan.name}</div>
          {plan.isFree ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: 400 }}>₩{plan.comparePrice} / 월</span>
              <div className="pps-price" style={{ color: '#fff', lineHeight: 1.1 }}>
                ₩0 <small style={{ fontSize: 16, fontWeight: 600 }}>무료</small>
              </div>
            </div>
          ) : (
            <div className="pps-price">₩{plan.price}<small>/월</small></div>
          )}
        </div>
        <div className="pps-features" style={plan.isFree ? { color: '#fff' } : {}} dangerouslySetInnerHTML={{ __html: plan.features.replace(/\n/g,'<br/>') }}/>
      </div>

      {/* Progress steps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
      {progressSteps.map((s, i, arr) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StepCircle state={s.state} index={i + 1} />
            <span style={{
              fontSize: 13,
              fontWeight: s.state === 'active' ? 600 : 400,
              color: s.state === 'pending' ? 'var(--muted)' : 'var(--ink)',
            }}>{s.label}</span>
          </div>
          {i < arr.length - 1 && <div style={{ width: 24, borderTop: '1.5px dashed var(--line)' }}/>}
        </React.Fragment>
      ))}
    </div>

      {!success && (
        <div>
          {/* Billing info */}
          <div className="pg-card" style={{ marginBottom: 16 }}>
            <div className="pg-label">청구 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input className="pg-input" placeholder="이름" value={buyerName} onChange={e => setBuyerName(e.target.value)}/>
              <EmailInput initialEmail={user?.email || ''} onChange={setBuyerEmail} />
            </div>
            {paymentError && (
              <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{paymentError}</div>
            )}
          </div>

          {/* Payment method — 유료 플랜만 */}
          {!plan.isFree && (
            <div className="pg-card" style={{ marginBottom: 16 }}>
              <div className="pg-label">결제 수단 선택</div>
              {[
                { id: 'kakao', label: '카카오페이', sub: '카카오페이 머니 · 신용/체크카드', logoClass: 'kakao', logoText: 'kakao pay' },
                { id: 'toss',  label: '토스페이먼츠', sub: '신용카드 · 계좌이체 · 간편결제', logoClass: 'toss', logoText: 'toss pay' },
              ].map(m => (
                <div key={m.id} className={`pp-method${method === m.id ? ' sel' : ''}`} onClick={() => { setMethod(m.id); setPaymentError(''); }}>
                  <div className={`pp-logo ${m.logoClass}`}>{m.logoText}</div>
                  <div className="pp-meta"><b>{m.label}</b><span>{m.sub}</span></div>
                  <div className="pp-radio"/>
                </div>
              ))}
            </div>
          )}

          {/* Order summary */}
          <div className="pg-card" style={{ marginBottom: 16 }}>
            <div className="pg-label">결제 금액 확인</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
              {plan.isFree ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Pro 요금제 정가 (1개월)</span>
                    <span style={{ color: 'var(--muted)' }}>₩{plan.comparePrice}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ok)' }}>
                    <span>무료 플랜 할인</span>
                    <span>-₩{plan.comparePrice}</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>{plan.name} (1개월)</span><span>₩{plan.price}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>부가세 (VAT 10%)</span><span>{plan.vat ? `₩${plan.vat.toLocaleString()}` : '포함'}</span></div>
                </>
              )}
              <hr className="pg-divider" style={{ margin: '4px 0' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
                <span>최종 결제금액</span>
                <span style={{ color: 'var(--orange)' }}>{plan.isFree ? '₩0' : `₩${plan.total}`}</span>
              </div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button className="pg-btn" onClick={closePage}>이전</button>
              {plan.isFree ? (
                <button
                  className="pg-btn primary"
                  style={{ flex: 1, padding: 14, fontSize: 15, opacity: isEmailValid ? 1 : 0.5, cursor: isEmailValid ? 'pointer' : 'not-allowed' }}
                  onClick={startFreePlan}
                  disabled={!isEmailValid}
                >
                  무료로 시작하기
                </button>
              ) : (
                <button
                  className="pg-btn primary"
                  style={{ flex: 1, padding: 14, fontSize: 15, opacity: isEmailValid ? 1 : 0.5, cursor: isEmailValid ? 'pointer' : 'not-allowed' }}
                  onClick={startPayment}
                  disabled={!!steps || !isEmailValid}
                >
                  {method === 'kakao' ? `카카오페이로 결제하기` : `토스페이먼츠로 결제하기`}
                </button>
              )}
            </div>
          </div>

          {/* Payment steps animation — 유료 플랜만 */}
          {!plan.isFree && steps && (
            <div className="pp-steps">
              {steps.map((s, i) => (
                <div key={i} className={`pp-step${s.state === 'active' ? ' active' : ''}${s.state === 'done' ? ' done' : ''}`}>
                  <div className="pp-step-icon">{s.state === 'done' ? '✓' : i + 1}</div>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="pp-success show">
          <div className="pp-check-circle">
            <svg viewBox="0 0 34 34" fill="none"><path d="M7 17.5 13.5 24 27 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          {plan.isFree ? (
            <>
              <h2>무료 플랜이 준비되었습니다!</h2>
              <div className="pp-hl-line"/>
              <p>신청을 완료하고 API Key를 발급받으세요.</p>
              <div className="pp-action-row" style={{ marginTop: 24 }}>
                <button className="pg-btn" onClick={closePage}>홈으로</button>
                <button className="pg-btn primary" onClick={openMypageOnApiKey}>신청 및 API Key 발급</button>
              </div>
            </>
          ) : (
            <>
              <h2>결제가 완료되었습니다!</h2>
              <div className="pp-hl-line"/>
              <p>{plan.name}이 활성화되었습니다. API Key는 마이페이지에서 관리할 수 있습니다.</p>
              <div className="pp-action-row">
                <button className="pg-btn" onClick={closePage}>홈으로</button>
                <button className="pg-btn primary" onClick={openMypageOnApiKey}>마이페이지</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}