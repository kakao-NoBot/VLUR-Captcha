// Pricing.jsx

import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const plans = [
  {
    tier: 'Basic', price: '₩0', period: '/월', desc: '월 100,000 호출', featured: false,
    features: [
      { ok: true,  text: 'CAPTCHA 유형 1·2 지원' },
      { ok: true,  text: '기본 드래그 궤적 검증' },
      { ok: true,  text: 'API Key 1개' },
      { ok: false, text: '대시보드 분석' },
      { ok: false, text: '우선 기술 지원' },
      { ok: false, text: 'SLA 보장' },
    ],
    btnLabel: '무료로 시작하기', btnClass: 'pg-btn primary',
  },
  {
    tier: 'Pro', price: '₩89,000', period: '/월', desc: '월 500,000 호출', featured: true, badge: '가장 인기',
    features: [
      { ok: true,  text: 'CAPTCHA 유형 1·2 지원' },
      { ok: true,  text: '고급 드래그 궤적 + 이상 행동 감지' },
      { ok: true,  text: 'API Key 최대 5개' },
      { ok: true,  text: '대시보드 분석 (30일)' },
      { ok: true,  text: '이메일 우선 지원' },
      { ok: false, text: 'SLA 99.9% 보장' },
    ],
    btnLabel: '결제하고 시작하기', btnClass: 'pg-btn primary',
  },
  {
    tier: 'Enterprise', price: '문의', period: '/월', desc: '무제한 호출 · 커스텀 SLA', featured: false,
    features: [
      { ok: true, text: 'Pro 모든 기능 포함' },
      { ok: true, text: 'SLA 99.9% 보장' },
      { ok: true, text: 'API Key 무제한' },
      { ok: true, text: '전담 매니저 지원' },
      { ok: true, text: '온프레미스 배포 가능' },
      { ok: true, text: '커스텀 모델 학습 지원' },
    ],
    btnLabel: '도입 문의하기', btnClass: 'pg-btn',
  },
];

export default function Pricing({ openPage, openPlanPayment, isLoggedIn, planRefreshKey }) {
  const [myPlan, setMyPlan] = useState(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setMyPlan(null);
      return;
    }
    let ignore = false;
    api.get('/auth/me')
      .then(({ data }) => { if (!ignore) setMyPlan(data.plan_name || null); })
      .catch(() => { if (!ignore) setMyPlan(null); });
    return () => { ignore = true; };
  }, [isLoggedIn, planRefreshKey]);

  return (
    <section className="band tint" id="pricing">
      <div className="wrap">
        <div className="sec-head" data-reveal style={{ maxWidth: '100%', textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
          <span className="eyebrow">Pricing</span>
          <h2>투명한 요금제</h2>
          <p>월 호출 횟수와 기능에 따라 선택하세요. Basic은 영구 무료입니다.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan, i) => (
            <div className={`price-card${plan.featured ? ' featured' : ''}`} key={plan.tier} data-reveal>
              {plan.badge && <div className="price-badge">{plan.badge}</div>}
              <div className="price-tier">{plan.tier}</div>
              <div className="price-amount" style={plan.tier === 'Enterprise' ? { fontSize: 28, paddingTop: 4 } : {}}>
                {plan.price}<span>{plan.period}</span>
              </div>
              <div className="price-desc">{plan.desc}</div>
              <ul className="price-features">
                {plan.features.map((f, i) => (
                  <li className={f.ok ? 'ok' : 'no'} key={i}>{f.text}</li>
                ))}
              </ul>
              <button
                className={plan.btnClass}
                style={{ width: '100%', padding: 14, marginTop: 'auto' }}
                disabled={plan.tier === myPlan}
                onClick={() => {
                  if (plan.tier === 'Pro') openPlanPayment('Pro');
                  else if (plan.tier === 'Basic') openPlanPayment('Basic');
                  else if (plan.tier === 'Enterprise') openPage('enterprise');
                }}
              >
                {plan.tier === myPlan ? '이미 사용중인 요금제' : plan.btnLabel}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 24 }}>
          모든 요금제는 KakaoPay · 토스페이먼츠로 결제 가능합니다. 월 단위 구독, 언제든 해지 가능.
        </p>
      </div>
    </section>
  );
}
