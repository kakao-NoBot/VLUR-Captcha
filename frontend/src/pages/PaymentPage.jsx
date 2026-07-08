// PaymentPage.jsx

import React, { useState } from 'react';

/* ── 스텝 인디케이터 원형 배지 ── */
function StepCircle({ state, index }) {
  // state: 'done' | 'active' | 'pending'
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

export default function PaymentPage({ closePage }) {
  const [method, setMethod] = useState('kakao');
  const [payStatus, setPayStatus] = useState('대기 · 결제 요청 버튼 선택 시 준비 → 인증 → 승인 상태를 확인합니다.');
  const [payDone, setPayDone] = useState(false);

  const simPayment = () => {
    const steps = method === 'kakao'
      ? ['① 결제 준비 요청 중…','② 카카오페이 인증 페이지 이동 중…','③ pg_token 수신 — 서버 승인 요청 중…','✓ 결제 완료! 티켓이 발급되었습니다.']
      : ['① TossPayments SDK 초기화 중…','② 결제창 열기 — requestPayment() 호출…','③ successUrl 수신 — 금액 검증 중…','✓ 결제 완료! confirm API 승인 성공.'];
    let i = 0;
    setPayDone(true);
    const run = () => {
      setPayStatus(steps[i++]);
      if (i < steps.length) setTimeout(run, 1200);
    };
    run();
  };

  return (
    <div className="po-body">

      <h1 className="pg-h1">결제 수단을 선택해 예매를 완료하세요</h1>
      <p className="pg-sub">CAPTCHA 통과 토큰 검증 후 결제 요청 단계입니다.</p>

      {/* Step indicators */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
      {[
        { label: 'CAPTCHA 통과', state: 'done' },
        { label: '좌석/주문 확정', state: 'done' },
        { label: '결제 인증', state: 'active' },
        { label: '서버 승인', state: 'pending' },
      ].map((s, i, arr) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StepCircle state={s.state} index={i + 1} />
            <span style={{
              fontSize: 13,
              fontWeight: s.state === 'active' ? 600 : 400,
              color: s.state === 'pending' ? 'var(--muted)' : 'var(--ink)',
            }}>{s.label}</span>
          </div>
          {i < arr.length - 1 && <div style={{ width: 28, borderTop: '1.5px dashed var(--line)' }}/>}
        </React.Fragment>
      ))}
    </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Order info */}
        <div className="pg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="pg-h3">주문 정보</span>
            <span style={{ fontSize: 11, background: 'var(--peach)', color: 'var(--orange)', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>ORDER-20260622-001</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>공연</span><strong>2026 SUMMER LIVE</strong></div>
            <hr className="pg-divider" style={{ margin: '4px 0' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>좌석</span><strong>R석 B구역 12열 08번</strong></div>
            <hr className="pg-divider" style={{ margin: '4px 0' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>티켓 1매</span><span>₩132,000</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>예매 수수료</span><span>₩2,000</span></div>
            <hr className="pg-divider" style={{ margin: '4px 0' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}><span>최종 결제금액</span><span style={{ color: 'var(--orange)' }}>₩134,000</span></div>
          </div>
        </div>
        {/* Security */}
        <div className="pg-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <span className="pg-h3">보안 검증</span>
            <span style={{ fontSize: 11, background: 'rgba(46,158,107,.15)', color: 'var(--ok)', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>통과</span>
          </div>
          <div style={{ background: 'var(--ink)', borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 12, color: '#C8E87A', lineHeight: 1.8, marginBottom: 12 }}>
            captcha_token: cap_otk_7f3a...<br/>
            expires_in: 180s<br/>
            order_hash: sha256:91a2...
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>결제 요청 전 서버가 one_time_token, 주문 금액, 좌석 홀드 만료 시간을 재검증합니다.</p>
        </div>
      </div>

      {/* Payment method */}
      <div className="pg-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <span className="pg-h3">결제 수단 선택</span>
          <span style={{ fontSize: 11, background: 'var(--peach)', color: 'var(--orange-2)', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>TEST MODE · 실제 결제 없음</span>
        </div>
        {[
          { id: 'kakao', logoClass: 'kakao', logoText: 'kakao pay', desc: '카카오페이 머니/카드 단건 결제', note: '서버 Ready API → next_redirect_*_url 이동 → pg_token → 서버 Approve API', tag: '직접 연동' },
          { id: 'toss',  logoClass: 'toss',  logoText: 'toss payments', desc: '카드·간편결제·계좌이체 통합 결제창', note: 'SDK requestPayment() → successUrl → 금액 검증 → 서버 Confirm API', tag: 'Widget v2' },
        ].map(m => (
          <div key={m.id} className={`pay-method${method === m.id ? ' sel' : ''}`} onClick={() => setMethod(m.id)}>
            <div>
              <div className={`pay-logo ${m.logoClass}`}>{m.logoText}</div>
              <div className="pay-desc">{m.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{m.note}</div>
            </div>
            <span className="pay-tag">{m.tag}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="pg-btn">이전</button>
          <button className="pg-btn primary" style={{ flex: 1 }} onClick={simPayment} disabled={payDone}>
            {method === 'kakao' ? '카카오페이로 ₩134,000 결제' : '토스페이먼츠로 ₩134,000 결제'}
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: payStatus.startsWith('✓') ? 'var(--ok)' : 'var(--muted)', minHeight: 18 }}>{payStatus}</div>
      </div>

      {/* API flow */}
      <div className="flow-steps" style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' }}>
        {[
          { label: '① 프런트', desc: '주문번호·금액·CAPTCHA 토큰을 자사 서버로 전달' },
          { label: '② 자사 서버', desc: '토큰·좌석 홀드·DB 금액 검증 후 PG 준비 요청' },
          { label: '③ PG 인증', desc: '카카오/토스 결제창에서 사용자 인증 후 성공·실패 URL 복귀' },
          { label: '④ 서버 승인', desc: '승인 API 호출, 멱등 처리, 결제/티켓 상태 원자적 저장' },
        ].map(s => (
          <div className="flow-step" key={s.label}><b>{s.label}</b>{s.desc}</div>
        ))}
      </div>

      {/* API panels */}
      <div className="api-panel-wrap">
        <div className="api-panel">
          <div className="api-panel-title">카카오페이 단건 결제 API <span style={{ fontSize: 11, background: 'rgba(255,255,255,.1)', padding: '3px 8px', borderRadius: 6 }}>Server-to-Server</span></div>
          <div className="api-row"><b>준비</b><code>POST /api/payments/kakao/ready</code></div>
          <div className="api-row"><b>저장</b><code>order_id ↔ tid, amount, status=READY</code></div>
          <div className="api-row"><b>인증</b><code>next_redirect_pc_url 이동<br/>→ approval_url?pg_token=...</code></div>
          <div className="api-row"><b>승인</b><code>POST /online/v1/payment/approve</code></div>
          <div className="api-row"><b>보안</b><code>Authorization: SECRET_KEY ${'${SK}'}<br/>서버 환경변수에서만 사용</code></div>
          <div className="state-strip">
            <div className="state-box">SUCCESS<br/>티켓 발급</div>
            <div className="state-box">CANCEL<br/>주문 복귀</div>
            <div className="state-box">FAIL<br/>재시도 안내</div>
          </div>
        </div>
        <div className="api-panel">
          <div className="api-panel-title">토스페이먼츠 결제위젯 v2 <span style={{ fontSize: 11, background: 'rgba(255,255,255,.1)', padding: '3px 8px', borderRadius: 6 }}>SDK + Server</span></div>
          <div className="api-row"><b>초기화</b><code>TossPayments(clientKey).widgets({'{customerKey}'})</code></div>
          <div className="api-row"><b>요청</b><code>widgets.requestPayment({'{orderId, orderName, successUrl, failUrl}'})</code></div>
          <div className="api-row"><b>검증</b><code>successUrl의 paymentKey/orderId/amount 수신<br/>DB 주문금액과 amount 일치 확인</code></div>
          <div className="api-row"><b>승인</b><code>POST /api/payments/toss/confirm</code></div>
          <div className="api-row"><b>보안</b><code>Authorization: Basic base64('${'${SK}'}:')<br/>Idempotency-Key: payment_attempt_id</code></div>
          <div className="state-strip">
            <div className="state-box">200 OK<br/>결제 완료</div>
            <div className="state-box">CANCELED<br/>재선택</div>
            <div className="state-box">4XX/5XX<br/>오류 매핑</div>
          </div>
        </div>
      </div>
    </div>
  );
}
