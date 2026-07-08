import React, { useEffect, useRef } from 'react';

const PLAN_INFO = {
  Basic: { label: 'Basic 요금제', price: '₩0/월' },
  Pro:   { label: 'Pro 요금제',   price: '₩89,000/월' },
};

function CheckIcon() {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
      background: 'linear-gradient(135deg, var(--gold), var(--orange-2))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
        <path d="M5 12.5 9.5 17 19 7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

/**
 * mode: 'schedule' (Pro<->Basic 변경 신청) | 'cancel' (예약된 다운그레이드 취소)
 * phase: 'confirm' | 'done'
 * currentPlan, targetPlan: 'Basic' | 'Pro'
 * effectiveDate: 다운그레이드가 적용되는/예정된 날짜 (YYYY-MM-DD)
 */
export default function PlanChangeModal({
  mode = 'schedule',
  currentPlan,
  targetPlan,
  phase = 'confirm',
  effectiveDate,
  loading,
  errorMessage,
  onConfirm,
  onClose,
}) {
  const closeRef = useRef(null);
  const isUpgrade = mode === 'schedule' && targetPlan === 'Pro' && currentPlan === 'Basic';
  const isDowngrade = mode === 'schedule' && targetPlan === 'Basic' && currentPlan === 'Pro';
  const isCancel = mode === 'cancel';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, loading]);

  const current = PLAN_INFO[currentPlan] || { label: currentPlan, price: '-' };
  const next = PLAN_INFO[targetPlan] || { label: targetPlan, price: '-' };

  const titles = {
    'schedule-confirm': '요금제 변경 확인',
    'schedule-done': '요금제 변경 예약 완료',
    'cancel-confirm': '예약 취소 확인',
    'cancel-done': '예약이 취소되었습니다',
  };
  const title = titles[`${mode}-${phase}`];

  return (
    <div
      onClick={() => !loading && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        background: 'rgba(0,0,0,.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-change-modal-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 460,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,.35)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px', borderBottom: '1px solid var(--line-soft)', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 4px' }}>VLUR CAPTCHA</p>
            <h2 id="plan-change-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--disp)', letterSpacing: '-.01em' }}>
              {title}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => !loading && onClose()}
            aria-label="닫기"
            style={{
              background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', textAlign: phase === 'done' ? 'center' : 'left' }}>
          {phase === 'done' ? (
            <>
              <CheckIcon />
              {isCancel ? (
                <>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 15 }}>Basic 전환 예약이 취소되었습니다.</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                    Pro 요금제를 계속 이용하실 수 있습니다.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 15 }}>Basic 요금제로 전환이 예약되었습니다.</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                    <strong>{effectiveDate}</strong>까지는 Pro 요금제를 계속 이용하실 수 있고,<br/>
                    이후 자동으로 Basic 요금제로 전환됩니다.
                  </p>
                </>
              )}
            </>
          ) : isCancel ? (
            <>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line-soft)', marginBottom: 20 }}>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>예약된 변경</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 15 }}>Basic 요금제</strong>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{effectiveDate}부터 적용</span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7, margin: 0 }}>
                지금 취소하면 예약이 사라지고 <strong>Pro 요금제</strong>를 계속 이용하시게 됩니다.
              </p>
              {errorMessage && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#c0392b' }}>{errorMessage}</p>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line-soft)', marginBottom: 20 }}>
                <div style={{ padding: '14px 18px', background: 'var(--paper)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>현재 요금제</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 15 }}>{current.label}</strong>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{current.price}</span>
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--line-soft)' }} />
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>변경 요금제</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 15 }}>{next.label}</strong>
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{next.price}</span>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7, margin: 0 }}>
                {isUpgrade && (
                  <>지금 전환하면 결제 절차로 이동하며, 결제가 완료되는 즉시 <strong>Pro 요금제</strong>로 업그레이드됩니다.</>
                )}
                {isDowngrade && (
                  <>지금 변경해도 현재 결제 기간이 끝날 때까지는 Pro 요금제를 그대로 이용하실 수 있습니다. 이후 별도 결제 없이 자동으로 <strong>Basic 요금제</strong>로 전환됩니다.</>
                )}
              </p>

              {errorMessage && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#c0392b' }}>{errorMessage}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid var(--line-soft)',
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          {phase === 'done' ? (
            <button type="button" className="pg-btn primary" onClick={onClose} style={{ padding: '10px 22px' }}>
              확인
            </button>
          ) : (
            <>
              <button type="button" className="pg-btn" onClick={onClose} disabled={loading} style={{ padding: '10px 20px' }}>
                돌아가기
              </button>
              <button
                type="button"
                className={isCancel ? 'pg-btn danger' : 'pg-btn primary'}
                onClick={onConfirm}
                disabled={loading}
                style={{ padding: '10px 22px', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? '처리 중...' : isCancel ? '예약 취소하기' : isUpgrade ? '결제 진행' : '변경 예약하기'}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}