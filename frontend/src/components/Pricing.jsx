import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import PlanChangeModal from './PlanChangeModal';

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
  const [pendingDowngrade, setPendingDowngrade] = useState(null); // { targetPlan, effectiveDate } | null
  // null | { mode: 'schedule'|'cancel', target, phase: 'confirm'|'done', effectiveDate, loading, error }
  const [changeModal, setChangeModal] = useState(null);

  const fetchProfile = () => {
    if (!isLoggedIn) {
      setMyPlan(null);
      setPendingDowngrade(null);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => {
        setMyPlan(data.plan_name || null);
        if (data.pending_plan_name && data.plan_change_at) {
          setPendingDowngrade({
            targetPlan: data.pending_plan_name,
            effectiveDate: String(data.plan_change_at).slice(0, 10),
          });
        } else {
          setPendingDowngrade(null);
        }
      })
      .catch(() => { setMyPlan(null); setPendingDowngrade(null); });
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, planRefreshKey]);

  const handlePlanClick = (tier) => {
    if (tier === 'Enterprise') { openPage('enterprise'); return; }

    // 이미 이 tier로 다운그레이드가 예약돼 있으면 → 취소 확인 모달
    if (pendingDowngrade && pendingDowngrade.targetPlan === tier && myPlan === 'Pro') {
      setChangeModal({
        mode: 'cancel', target: tier, phase: 'confirm',
        effectiveDate: pendingDowngrade.effectiveDate, loading: false, error: '',
      });
      return;
    }

    const needsConfirm = isLoggedIn && myPlan
      && (myPlan === 'Basic' || myPlan === 'Pro')
      && (tier === 'Basic' || tier === 'Pro')
      && myPlan !== tier;

    if (needsConfirm) {
      setChangeModal({ mode: 'schedule', target: tier, phase: 'confirm', effectiveDate: null, loading: false, error: '' });
      return;
    }

    if (tier === 'Pro') openPlanPayment('Pro');
    else if (tier === 'Basic') openPlanPayment('Basic');
  };

  const closeChangeModal = () => setChangeModal(null);

  const confirmChange = async () => {
    if (!changeModal) return;

    if (changeModal.mode === 'cancel') {
      setChangeModal(m => ({ ...m, loading: true, error: '' }));
      try {
        await api.post('/payments/cancel-scheduled-downgrade');
        setChangeModal(m => ({ ...m, loading: false, phase: 'done' }));
      } catch (err) {
        setChangeModal(m => ({ ...m, loading: false, error: err.response?.data?.detail || '예약 취소에 실패했습니다.' }));
      }
      return;
    }

    const isUpgrade = myPlan === 'Basic' && changeModal.target === 'Pro';
    if (isUpgrade) {
      setChangeModal(null);
      openPlanPayment('Pro');
      return;
    }

    setChangeModal(m => ({ ...m, loading: true, error: '' }));
    try {
      const { data } = await api.post('/payments/schedule-downgrade');
      setChangeModal(m => ({ ...m, loading: false, phase: 'done', effectiveDate: data.effective_date }));
    } catch (err) {
      setChangeModal(m => ({ ...m, loading: false, error: err.response?.data?.detail || '요금제 변경 예약에 실패했습니다.' }));
    }
  };

  const finishChangeModal = () => {
    setChangeModal(null);
    fetchProfile();
  };

  const isPendingForPlan = (plan) =>
    pendingDowngrade && pendingDowngrade.targetPlan === plan.tier && myPlan === 'Pro';

  const getButtonLabel = (plan) => {
    if (isPendingForPlan(plan)) return '예약 취소하기';
    if (plan.tier === myPlan) return '사용중인 요금제';
    return plan.btnLabel;
  };

  const isButtonDisabled = (plan) => {
    // 예약 취소를 위해 클릭 가능해야 하므로 disabled 처리하지 않음
    if (isPendingForPlan(plan)) return false;
    if (plan.tier === myPlan) return true;
    return false;
  };

  const getButtonClass = (plan) => {
    if (isPendingForPlan(plan)) return 'pg-btn primary';
    return plan.btnClass;
  };

  return (
    <section className="band tint" id="pricing">
      <div className="wrap">
        <div className="sec-head" data-reveal style={{ maxWidth: '100%', textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
          <span className="eyebrow">Pricing</span>
          <h2>투명한 요금제</h2>
          <p>월 호출 횟수와 기능에 따라 선택하세요. Basic은 영구 무료입니다.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
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

              <div style={{ marginTop: 'auto' }}>
                <p style={{
                  fontSize: 12, color: 'var(--muted)', textAlign: 'center',
                  margin: '0 0 6px', minHeight: 16,
                }}>
                  {isPendingForPlan(plan) ? `${pendingDowngrade.effectiveDate}부터 적용 예정` : '\u00A0'}
                </p>
                <button
                  className={getButtonClass(plan)}
                  style={{ width: '100%', padding: 14, opacity: isButtonDisabled(plan) ? 0.6 : 1 }}
                  disabled={isButtonDisabled(plan)}
                  onClick={() => handlePlanClick(plan.tier)}
                >
                  {getButtonLabel(plan)}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)', marginTop: 24 }}>
          모든 요금제는 KakaoPay · 토스페이먼츠로 결제 가능합니다. 월 단위 구독, 언제든 해지 가능.
        </p>
      </div>

      {changeModal && (
        <PlanChangeModal
          mode={changeModal.mode}
          currentPlan={myPlan}
          targetPlan={changeModal.target}
          phase={changeModal.phase}
          effectiveDate={changeModal.effectiveDate}
          loading={changeModal.loading}
          errorMessage={changeModal.error}
          onConfirm={confirmChange}
          onClose={changeModal.phase === 'done' ? finishChangeModal : closeChangeModal}
        />
      )}
    </section>
  );
}