// pages/ApplyPage.jsx

import React, { useState } from 'react';

const PLAN_LABELS = {
  Basic: 'Basic — 무료',
  Pro: 'Pro — ₩89,000/월',
  Enterprise: 'Enterprise — 문의',
};

const PLANS = [
  { id: 'Basic',      label: 'BASIC',      price: '₩0',     sub: '월 10만 호출' },
  { id: 'Pro',        label: 'PRO ★',      price: '₩89,000', sub: '월 50만 호출' },
  { id: 'Enterprise', label: 'ENTERPRISE', price: '문의',   sub: '무제한' },
];

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

export default function ApplyPage({ openPage, initialPlan = 'Pro' }) {
  const [plan, setPlan] = useState(initialPlan);
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const [emailBlurred, setEmailBlurred] = useState(false);
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isValid = company.trim().length > 0 && isEmailFormatValid;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    openPage('apply-done');
  };

  return (
    <div className="po-body" style={{ maxWidth: 560 }}>
      <div className="pg-eyebrow">SC-15 · API Key 발급 신청</div>
      <h1 className="pg-h1">이용 신청</h1>
      <p className="pg-sub">요금제를 선택하고 신청을 완료하면 API Key가 즉시 발급됩니다.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {PLANS.map(p => {
          const isSelected = plan === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setPlan(p.id)}
              style={{
                cursor: 'pointer',
                textAlign: 'center',
                background: isSelected ? 'var(--peach)' : 'var(--card)',
                border: `2px solid ${isSelected ? 'var(--orange)' : 'var(--line)'}`,
                borderRadius: 'var(--r)',
                padding: '20px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minHeight: 110,
                transition: '.15s',
                boxShadow: isSelected ? '0 0 0 3px rgba(240,105,30,.12)' : 'none',
              }}
            >
              <div style={{
                fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 11,
                letterSpacing: '.14em', textTransform: 'uppercase',
                color: isSelected ? 'var(--orange)' : 'var(--muted)',
              }}>{p.label}</div>
              <div style={{ fontFamily: 'var(--disp)', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{p.price}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.sub}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <input
            className="pg-input"
            placeholder="서비스/회사명"
            value={company}
            onChange={e => setCompany(e.target.value)}
            style={{
              width: '100%',
              borderColor: touched && !company.trim() ? '#e0533d' : undefined,
            }}
          />
          {touched && !company.trim() && (
            <div style={{ color: '#e0533d', fontSize: 12, marginTop: 4 }}>서비스/회사명을 입력해주세요.</div>
          )}
        </div>
        <div>
          <input
            className="pg-input"
            type="email"
            placeholder="연락 이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => setEmailBlurred(true)}
            style={{
              width: '100%',
              borderColor: (touched || (emailBlurred && email.trim())) && !isEmailFormatValid ? '#e0533d' : undefined,
            }}
          />
          {(touched || (emailBlurred && email.trim())) && !isEmailFormatValid && (
            <div style={{ color: '#e0533d', fontSize: 12, marginTop: 4 }}>
              {email.trim() ? '올바른 이메일 주소를 입력해 주세요.' : '연락 이메일을 입력해주세요.'}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--peach)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, fontSize: 14, color: 'var(--ink-soft)' }}>
          선택된 요금제: <strong style={{ color: 'var(--orange)' }}>{PLAN_LABELS[plan]}</strong><br/>
          <span style={{ fontSize: 12 }}>신청 완료 후 마이페이지 &gt; API Key 관리에서 확인 가능</span>
        </div>

        <button
          type="button"
          className="pg-btn primary"
          style={{
            padding: 15,
            fontSize: 16,
            opacity: isValid ? 1 : 0.5,
            cursor: isValid ? 'pointer' : 'not-allowed',
          }}
          onClick={handleSubmit}
        >신청 및 API Key 발급</button>
      </div>
    </div>
  );
}