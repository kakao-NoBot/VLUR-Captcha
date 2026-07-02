// MypagePage.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import GuideStepModal from '../components/GuideStepModal';

const realKey = 'sk-aicap_prod_7f3a91b2c4d5e6f789012345xxxx';

const EMAIL_DOMAIN_OPTIONS = [
  { value: 'gmail.com', label: 'gmail.com' },
  { value: 'naver.com', label: 'naver.com' },
  { value: 'daum.net', label: 'daum.net' },
  { value: 'kakao.com', label: 'kakao.com' },
  { value: 'hanmail.net', label: 'hanmail.net' },
  { value: 'outlook.com', label: 'outlook.com' },
  { value: 'custom', label: '직접 입력' },
];

/* ── 공통 모달 ── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 'var(--r)', padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 20, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SuccessCheckIcon() {
  return (
    <div style={{
      width: 48, height: 48, margin: '0 auto', borderRadius: '50%',
      background: 'var(--ok)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <svg viewBox="0 0 34 34" fill="none" width={22} height={22} aria-hidden="true">
        <path
          d="M7 17.5 13.5 24 27 10"
          stroke="#fff"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ChangePwModal({ onClose }) {
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [attempted, setAttempted] = useState(false);   // ← 추가

  const isValid = current.trim() && next.trim() && confirm.trim();

  const errorStyle = { border: '1.5px solid #c0392b' };

  const handleChange = () => {
    if (!isValid) {
      setAttempted(true);
      return;
    }
    setDone(true);
  };

  return (
    <Modal title="비밀번호 변경" onClose={onClose}>
      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="pg-input"
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            placeholder="현재 비밀번호"
            style={attempted && !current.trim() ? errorStyle : {}}
          />
          <input
            className="pg-input"
            type="password"
            value={next}
            onChange={e => setNext(e.target.value)}
            placeholder="새 비밀번호"
            style={attempted && !next.trim() ? errorStyle : {}}
          />
          <input
            className="pg-input"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="새 비밀번호 확인"
            style={attempted && !confirm.trim() ? errorStyle : {}}
          />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>영문·숫자·특수문자 포함 8자 이상</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="pg-btn" style={{ flex: 1, padding: 13 }} onClick={onClose}>취소</button>
            <button
              className="pg-btn primary"
              style={{ flex: 1, padding: 13, opacity: isValid ? 1 : 0.5, cursor: isValid ? 'pointer' : 'not-allowed' }}
              onClick={handleChange}
            >변경하기</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
  <div style={{
    width: 48, height: 48, borderRadius: '50%',
    background: 'var(--ok)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  }}>
    <svg viewBox="0 0 34 34" fill="none" width={22} height={22}>
      <path d="M7 17.5 13.5 24 27 10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    </div>
    <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>비밀번호가 변경되었습니다.</p>
    <button className="pg-btn primary" style={{ width: '100%', padding: 13 }} onClick={onClose}>확인</button>
  </div>
      )}
    </Modal>
  );
}

function EditInfoModal({ onClose, user }) {
  const [done, setDone] = useState(false);
  const [name, setName] = useState(user?.user_name || '');

  const initialEmail = user?.email || '';
  const [initialLocal, initialDomain] = initialEmail.includes('@')
    ? initialEmail.split('@')
    : [initialEmail, ''];
  const knownDomain = EMAIL_DOMAIN_OPTIONS.some(o => o.value === initialDomain);

  const [emailLocalPart, setEmailLocalPart] = useState(initialLocal);
  const [emailDomain, setEmailDomain] = useState(initialDomain && knownDomain ? initialDomain : initialDomain ? 'custom' : 'gmail.com');
  const [customEmailDomain, setCustomEmailDomain] = useState(!knownDomain && initialDomain ? initialDomain : '');
  const [isEmailDomainMenuOpen, setIsEmailDomainMenuOpen] = useState(false);
  const emailDomainControlRef = useRef(null);
  const customEmailDomainInputRef = useRef(null);

  const [phone, setPhone] = useState(user?.phone || '');
  const [attempted, setAttempted] = useState(false);

  const errorStyle = { border: '1.5px solid #c0392b' };
  const isCustomEmailDomain = emailDomain === 'custom';
  const selectedEmailDomain = isCustomEmailDomain ? customEmailDomain.trim() : emailDomain;
  const finalEmail =
    emailLocalPart.trim() && selectedEmailDomain
      ? `${emailLocalPart.trim()}@${selectedEmailDomain}`
      : '';
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail);

  const isValid = name.trim() && isEmailValid && phone.trim();

  useEffect(() => {
    if (!isEmailDomainMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (emailDomainControlRef.current && !emailDomainControlRef.current.contains(event.target)) {
        setIsEmailDomainMenuOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsEmailDomainMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEmailDomainMenuOpen]);

  useEffect(() => {
    if (isCustomEmailDomain) {
      customEmailDomainInputRef.current?.focus();
    }
  }, [isCustomEmailDomain]);

  const handleEmailDomainSelect = (domainValue) => {
    setEmailDomain(domainValue);
    setIsEmailDomainMenuOpen(false);
  };

  const handleSave = () => {
    if (!isValid) {
      setAttempted(true);
      return;
    }
    setDone(true);
  };

  return (
    <Modal title="정보 수정" onClose={onClose}>
      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="pg-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="이름"
            style={attempted && !name.trim() ? errorStyle : {}}
          />

          <div
            className={`signup-email-combo${attempted && !isEmailValid ? ' is-error' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              border: '1.5px solid var(--line)',
              borderRadius: 12,
              background: '#fff',
              overflow: 'visible',
              ...(attempted && !isEmailValid ? errorStyle : {}),
            }}
          >
            <input
              type="text"
              inputMode="email"
              placeholder="이메일 아이디"
              aria-label="이메일 아이디"
              value={emailLocalPart}
              onChange={e => setEmailLocalPart(e.target.value)}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                padding: '13px 16px',
                fontSize: 15,
                fontFamily: 'var(--body)',
                background: 'transparent',
                color: 'var(--ink)',
              }}
            />
            <div
              className={`signup-email-domain-control${isEmailDomainMenuOpen ? ' is-open' : ''}`}
              ref={emailDomainControlRef}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flex: 1,
                minWidth: 0,
                padding: '0 12px 0 14px',
              }}
            >
              {isCustomEmailDomain ? (
                <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, color: 'var(--ink)', fontSize: 15, fontFamily: 'var(--body)' }}>@</span>
                  <input
                    ref={customEmailDomainInputRef}
                    className="signup-email-domain-input"
                    type="text"
                    inputMode="email"
                    aria-label="이메일 도메인 직접 입력"
                    value={customEmailDomain}
                    onChange={e => setCustomEmailDomain(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      outline: 'none',
                      padding: '13px 0',
                      fontSize: 15,
                      fontFamily: 'var(--body)',
                      background: 'transparent',
                      color: 'var(--ink)',
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="signup-email-domain-value"
                  aria-label={`이메일 도메인 ${emailDomain}`}
                  onClick={() => setIsEmailDomainMenuOpen(true)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    minWidth: 0,
                    border: 'none',
                    background: 'none',
                    padding: '13px 0',
                    fontSize: 15,
                    fontFamily: 'var(--body)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  {`@${emailDomain}`}
                </button>
              )}
              <button
                type="button"
                className="signup-email-domain-toggle"
                aria-label="이메일 도메인 목록 열기"
                aria-haspopup="listbox"
                aria-expanded={isEmailDomainMenuOpen}
                onClick={() => setIsEmailDomainMenuOpen(current => !current)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--orange)',
                  padding: 4,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isEmailDomainMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isEmailDomainMenuOpen && (
                <div
                  className="signup-email-domain-menu"
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: -14,
                    right: -12,
                    zIndex: 20,
                    background: '#fff',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    boxShadow: '0 16px 38px -18px rgba(55,38,25,.34)',
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {EMAIL_DOMAIN_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`signup-email-domain-option${emailDomain === option.value ? ' selected' : ''}`}
                      role="option"
                      aria-selected={emailDomain === option.value}
                      onClick={() => handleEmailDomainSelect(option.value)}
                      style={{
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 14,
                        fontFamily: 'var(--body)',
                        cursor: 'pointer',
                        background: emailDomain === option.value ? 'var(--peach)' : 'transparent',
                        color: emailDomain === option.value ? 'var(--orange-2)' : 'var(--ink-soft)',
                        fontWeight: emailDomain === option.value ? 700 : 500,
                      }}
                    >
                      {option.value === 'custom' ? option.label : `@${option.label}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <input
            className="pg-input"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="휴대폰 번호"
            style={attempted && !phone.trim() ? errorStyle : {}}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="pg-btn" style={{ flex: 1, padding: 13 }} onClick={onClose}>취소</button>
            <button
              className="pg-btn primary"
              style={{ flex: 1, padding: 13, opacity: isValid ? 1 : 0.5, cursor: isValid ? 'pointer' : 'not-allowed' }}
              onClick={handleSave}
            >저장</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <SuccessCheckIcon />
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>정보가 수정되었습니다.</p>
          <button className="pg-btn primary" style={{ width: '100%', padding: 13 }} onClick={onClose}>확인</button>
        </div>
      )}
    </Modal>
  );
}

/* ── SC-07 내 정보 탭 ── */
function InfoTab({ user }) {
  const [modal, setModal] = useState(null); // null | 'pw' | 'edit'

  const readOnlyInputStyle = {
    background: 'var(--paper)',
    cursor: 'default',
    caretColor: 'transparent',
  };
  const preventFocus = (e) => e.target.blur();

  return (
    <>
      <h2 className="pg-h2" style={{ marginBottom: 20 }}>내 정보</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>이름</div>
          <input
            className="pg-input"
            value={user?.user_name || ''}
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
            onChange={() => {}}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>이메일</div>
          <input
            className="pg-input"
            value={user?.email || ''}
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
            onChange={() => {}}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>요금제</div>
          <input
            className="pg-input"
            defaultValue="Pro"
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>가입일</div>
          <input
            className="pg-input"
            defaultValue="2026-01-01"
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="pg-btn" onClick={() => setModal('pw')}>비밀번호 변경</button>
          <button className="pg-btn" onClick={() => setModal('edit')}>정보 수정</button>
        </div>
      </div>

      {modal === 'pw'   && <ChangePwModal onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditInfoModal onClose={() => setModal(null)} user={user} />}
    </>
  );
}

/* ── API Key 재발급 확인 모달 ── */
function ReissueConfirmModal({ onConfirm, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--orange)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M12 8v5M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M10.3 3.9 2.6 17.5A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.5L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>재발급하시겠어요?</strong>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>재발급하면 기존 Key가 즉시 만료됩니다.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <button className="pg-btn" style={{ flex: 1, padding: 11 }} onClick={onClose}>취소</button>
          <button className="pg-btn primary" style={{ flex: 1, padding: 11 }} onClick={onConfirm}>확인</button>
        </div>
      </div>
    </div>
  );
}

/* ── API Key 재발급 완료 모달 ── */
function ReissueDoneModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <SuccessCheckIcon />
        <strong style={{ fontSize: 16 }}>새 API Key가 발급되었습니다.</strong>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

/* ── SC-08 API Key 탭 ── */
function ApiKeyTab({ openPage }) {
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(realKey);
  const [copyLabel, setCopyLabel] = useState('복사');
  const [showReissueConfirm, setShowReissueConfirm] = useState(false);
  const [showReissueDone, setShowReissueDone] = useState(false);
  const [guideStep, setGuideStep] = useState(null);

  const copy = () => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopyLabel('복사됨 ✓');
    setTimeout(() => setCopyLabel('복사'), 1500);
  };

  const reissue = () => {
    setShowReissueConfirm(true);
  };

  const doReissue = () => {
    const newKey = 'sk-aicap_prod_' + Math.random().toString(36).slice(2, 18) + 'xxxx';
    setKey(newKey);
    setVisible(true);
    setShowReissueConfirm(false);
    setShowReissueDone(true);
  };

  return (
    <>
      <h2 className="pg-h2" style={{ marginBottom: 20 }}>API Key 관리</h2>
      <div className="pg-card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span className="pg-h3">현재 API Key</span>
          <span className="pill" style={{ background: 'var(--ok)' }}>사용 중</span>
        </div>
        <div className="key-box">
          <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{visible ? key : 'sk-••••••••••••••••••••••••xxxx'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pg-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => setVisible(v => !v)}>조회</button>
            <button className="pg-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={copy}>{copyLabel}</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, margin: '14px 0', fontSize: 13, color: 'var(--ink-soft)' }}>
          <span>발급일: 2026-01-01</span><span>만료일: 2027-01-01</span><span>요금제: Pro</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pg-btn primary" onClick={reissue}>재발급</button>
          <button className="pg-btn" onClick={() => setGuideStep(0)}>사용 가이드 보기</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>재발급 시 기존 Key는 즉시 만료됩니다.</p>
      </div>
      <div style={{ background: 'var(--peach)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 16px', marginTop: 14, fontSize: 13, color: 'var(--ink-soft)', maxWidth: 560 }}>
        ※ 발급 한도 / Key 개수 제한은 요금제(plan)별 api_limit 정책에 따름
      </div>

      {showReissueConfirm && (
        <ReissueConfirmModal
          onConfirm={doReissue}
          onClose={() => setShowReissueConfirm(false)}
        />
      )}
      {showReissueDone && (
        <ReissueDoneModal onClose={() => setShowReissueDone(false)} />
      )}
      {guideStep !== null && (
        <GuideStepModal
          stepIndex={guideStep}
          onClose={() => setGuideStep(null)}
          onMove={setGuideStep}
        />
      )}
    </>
  );
}

const DAILY_USAGE_VALUES = [
  820, 1100, 950, 1240, 1380, 990, 670, 1050, 1180, 1320,
  880, 740, 1060, 1290, 1100, 930, 1040, 1170, 1350, 990,
  850, 1080, 1250, 1060, 970, 1130, 1200, 1340, 1180, 1240,
];
const MONTHLY_USAGE_LABELS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
];
const MONTHLY_USAGE_VALUES = [18000, 22000, 19500, 24000, 28000, 31200, 29800, 33000, 27000, 30500, 31200, 32800];
const formatNumber = new Intl.NumberFormat('ko-KR').format;

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function shiftMonth(monthKey, amount) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}

function getMonthTitle(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function getCalendarDays(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstDay.getUTCDay()));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const dateString = date.toISOString().slice(0, 10);

    return {
      date: dateString,
      day: date.getUTCDate(),
      isCurrentMonth: dateString.slice(0, 7) === monthKey,
    };
  });
}

const DAILY_USAGE_DATA = DAILY_USAGE_VALUES.map((issued, index) => {
  const ratio = 0.958 + ((index % 5) * 0.003);
  return {
    date: addDays('2026-05-14', index),
    issued,
    verified: Math.round(issued * ratio),
  };
});
const MONTHLY_USAGE_DATA = MONTHLY_USAGE_VALUES.map((issued, index) => ({
  month: MONTHLY_USAGE_LABELS[index],
  issued,
}));
const DEFAULT_USAGE_START_DATE = DAILY_USAGE_DATA[0].date;
const DEFAULT_USAGE_END_DATE = DAILY_USAGE_DATA[DAILY_USAGE_DATA.length - 1].date;
const TODAY_DATE = new Date().toISOString().slice(0, 10);
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getSuccessRate(row) {
  if (!row.issued) return '-';
  return `${((row.verified / row.issued) * 100).toFixed(1)}%`;
}

function UsageBarChart({ data, labelKey, valueKey = 'issued', emptyMessage }) {
  const max = Math.max(0, ...data.map((row) => row[valueKey]));

  if (!data.length || max === 0) {
    return <div className="usage-empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="usage-chart-bars">
      {data.map((row) => {
        const value = row[valueKey];
        const height = Math.max(3, Math.round((value / max) * 100));
        return (
          <div
            className="usage-chart-bar"
            key={row[labelKey]}
            title={`${row[labelKey]} · ${formatNumber(value)}회`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

/* ── SC-09 사용량 탭 ── */
function UsageTab() {
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedRange, setAppliedRange] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(DEFAULT_USAGE_END_DATE.slice(0, 7));
  const [dateError, setDateError] = useState('');
  const datePickerRef = useRef(null);

  useEffect(() => {
    if (!isDatePickerOpen) return undefined;

    const handleMouseDown = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsDatePickerOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDatePickerOpen]);

  const activeRange = appliedRange || {
    start: DEFAULT_USAGE_START_DATE,
    end: DEFAULT_USAGE_END_DATE,
  };

  const filteredDailyUsageData = useMemo(() => (
    DAILY_USAGE_DATA.filter((row) => (
      row.date >= activeRange.start && row.date <= activeRange.end
    ))
  ), [activeRange.start, activeRange.end]);

  const usageTableRows = useMemo(() => (
    [...filteredDailyUsageData].reverse()
  ), [filteredDailyUsageData]);

  const periodLabel = appliedRange
    ? appliedRange.start === appliedRange.end
      ? appliedRange.start
      : `${appliedRange.start} ~ ${appliedRange.end}`
    : '기간 선택';

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  const selectCalendarDate = (dateString) => {
    setDateError('');

    if (!startDate || endDate) {
      setStartDate(dateString);
      setEndDate('');
      setCalendarMonth(dateString.slice(0, 7));
      return;
    }

    if (dateString < startDate) {
      setStartDate(dateString);
      setEndDate(startDate);
    } else {
      setEndDate(dateString);
    }
    setCalendarMonth(dateString.slice(0, 7));
  };

  const getDateCellClassName = (day) => {
    const hasRange = startDate && endDate;
    const isStart = day.date === startDate;
    const isEnd = day.date === endDate;
    const isInRange = hasRange && day.date >= startDate && day.date <= endDate;

    return [
      'usage-calendar-day',
      !day.isCurrentMonth ? 'muted' : '',
      day.date === TODAY_DATE ? 'today' : '',
      isInRange ? 'in-range' : '',
      isStart || isEnd ? 'selected' : '',
      isStart ? 'range-start' : '',
      isEnd ? 'range-end' : '',
    ].filter(Boolean).join(' ');
  };

  const applyDateRange = () => {
    if (!startDate) {
      setDateError('조회할 날짜를 선택해주세요.');
      return;
    }
    const normalizedStart = startDate;
    const normalizedEnd = endDate || startDate;

    if (normalizedStart > normalizedEnd) {
      setDateError('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }

    setAppliedRange({ start: normalizedStart, end: normalizedEnd });
    setDateError('');
    setIsDatePickerOpen(false);
  };

  const resetDateRange = () => {
    setStartDate('');
    setEndDate('');
    setCalendarMonth(DEFAULT_USAGE_END_DATE.slice(0, 7));
    setAppliedRange(null);
    setDateError('');
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 className="pg-h2">사용량 조회</h2>
        </div>
        <div className="usage-actions">
          <div className="usage-date-picker" ref={datePickerRef}>
            <button
              className="pg-btn"
              type="button"
              aria-expanded={isDatePickerOpen}
              aria-controls="usage-date-picker-panel"
              style={{ fontSize: 13, padding: '8px 14px' }}
              onClick={() => {
                setDateError('');
                setIsDatePickerOpen((open) => !open);
              }}
            >
              {periodLabel} ▾
            </button>

            {isDatePickerOpen && (
              <div className="usage-date-panel" id="usage-date-picker-panel">
                <div className="usage-date-chips">
                  <span><b>시작일</b>{startDate || '미선택'}</span>
                  <span><b>종료일</b>{endDate || '미선택'}</span>
                </div>

                <div className="usage-calendar-header">
                  <button
                    className="usage-calendar-nav"
                    type="button"
                    aria-label="이전 달"
                    onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                  >
                    ‹
                  </button>
                  <div className="usage-calendar-title">{getMonthTitle(calendarMonth)}</div>
                  <button
                    className="usage-calendar-nav"
                    type="button"
                    aria-label="다음 달"
                    onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}
                  >
                    ›
                  </button>
                </div>

                <div className="usage-calendar-weekdays" aria-hidden="true">
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>

                <div className="usage-calendar-grid">
                  {calendarDays.map((day) => (
                    <button
                      className={getDateCellClassName(day)}
                      key={day.date}
                      type="button"
                      aria-label={`${day.date} 선택`}
                      aria-pressed={day.date === startDate || day.date === endDate}
                      onClick={() => selectCalendarDate(day.date)}
                    >
                      {day.day}
                    </button>
                  ))}
                </div>

                {dateError && <p className="usage-date-error">{dateError}</p>}
                <div className="usage-date-buttons">
                  <button className="pg-btn" type="button" onClick={() => setIsDatePickerOpen(false)}>닫기</button>
                  <div className="usage-date-action-group">
                    <button className="pg-btn" type="button" onClick={resetDateRange}>초기화</button>
                    <button className="pg-btn primary" type="button" onClick={applyDateRange}>적용</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button className="pg-btn" style={{ fontSize: 13, padding: '8px 14px' }}>CSV 다운로드</button>
        </div>
      </div>
      <div className="pg-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
          <span>이번 달 API 호출량</span><strong>31,200 / 50,000회</strong>
        </div>
        <div className="usage-bar-wrap"><div className="usage-bar" style={{ width: '62%' }}/></div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>한도의 62% 사용 중 (Pro 요금제 api_limit 기준)</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="pg-card" style={{ minHeight: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="pg-label" style={{ margin: 0 }}>일별 호출량 ({appliedRange ? '선택 기간' : '최근 30일'})</div>
          <UsageBarChart
            data={filteredDailyUsageData}
            labelKey="date"
            emptyMessage="선택한 기간의 사용량 데이터가 없습니다."
          />
        </div>
        <div className="pg-card" style={{ minHeight: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="pg-label" style={{ margin: 0 }}>월별 호출량 (최근 12개월)</div>
          <UsageBarChart
            data={MONTHLY_USAGE_DATA}
            labelKey="month"
            emptyMessage="월별 사용량 데이터가 없습니다."
          />
        </div>
      </div>
      <table className="pg-table">
        <thead><tr><th>날짜</th><th>CAPTCHA 발급</th><th>CAPTCHA 검증</th><th>성공률</th></tr></thead>
        <tbody>
          {usageTableRows.length > 0 ? (
            usageTableRows.map((row) => (
              <tr key={row.date}>
                <td>{row.date}</td>
                <td>{formatNumber(row.issued)}</td>
                <td>{formatNumber(row.verified)}</td>
                <td>{getSuccessRate(row)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                선택한 기간의 사용량 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/* ── 탈퇴 확인 모달 (작은 사이즈) ── */
function ConfirmDeactivateModal({ onConfirm, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#c0392b', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M12 8v5M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M10.3 3.9 2.6 17.5A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.5L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>정말로 탈퇴하시겠어요?</strong>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>이 작업은 되돌릴 수 없습니다.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <button className="pg-btn" style={{ flex: 1, padding: 11 }} onClick={onClose}>취소</button>
          <button className="pg-btn danger" style={{ flex: 1, padding: 11 }} onClick={onConfirm}>확인</button>
        </div>
      </div>
    </div>
  );
}

/* ── 탈퇴 동의 체크 경고 모달 ── */
function AgreeWarnModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#c0392b', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M12 8v5M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M10.3 3.9 2.6 17.5A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.5L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <strong style={{ fontSize: 16 }}>탈퇴 동의 체크박스를 선택해주세요.</strong>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

/* ── 비밀번호 미입력 경고 모달 ── */
function PasswordWarnModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#c0392b', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M12 8v5M12 16.5h.01" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M10.3 3.9 2.6 17.5A1.6 1.6 0 0 0 4 20h16a1.6 1.6 0 0 0 1.4-2.5L13.7 3.9a1.6 1.6 0 0 0-2.8 0Z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
        </div>
        <strong style={{ fontSize: 16 }}>비밀번호를 입력해주세요.</strong>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

/* ── 탈퇴 완료 모달 (작은 사이즈) ── */
function DeactivateDoneModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <SuccessCheckIcon />
        <div>
          <strong style={{ display: 'block', fontSize: 16 }}>탈퇴가 완료되었습니다</strong>
        </div>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

/* ── SC-17 계정 탈퇴 탭 (탈퇴사유 제거) ── */
function DeactivateTab({ closePage }) {
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAgreeWarn, setShowAgreeWarn] = useState(false);
  const [showPwWarn, setShowPwWarn] = useState(false);

  const confirm_ = () => {
    if (!password.trim()) { setShowPwWarn(true); return; }
    if (!agreed) { setShowAgreeWarn(true); return; }
    setShowConfirm(true);
  };

  const doDeactivate = () => {
    setShowConfirm(false);
    setShowDone(true);
  };

  const finishClose = () => {
    setShowDone(false);
    closePage();
  };

  const isValid = password.trim() && agreed;

  return (
    <>
      <h2 className="pg-h2" style={{ marginBottom: 20 }}>계정 탈퇴</h2>
      <div className="warn-box" style={{ maxWidth: 520, marginBottom: 20 }}>
        <strong>⚠ 탈퇴 시 안내</strong>
        계정 정보, API Key, 결제/사용량 이력이 모두 삭제되며 복구할 수 없습니다.<br/>
        진행 중인 요금제 구독은 즉시 해지됩니다.<br/>
        작성한 게시글/문의 내역은 별도 처리 정책에 따릅니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        <input
          className="pg-input"
          type="password"
          placeholder="비밀번호 확인"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 17, height: 17, accentColor: '#c0392b' }}/>
          위 내용을 확인했으며 탈퇴에 동의합니다
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pg-btn">취소</button>
          <button
            className="pg-btn danger"
            onClick={confirm_}
            style={{ opacity: isValid ? 1 : 0.5, cursor: isValid ? 'pointer' : 'not-allowed' }}
          >탈퇴하기</button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDeactivateModal
          onConfirm={doDeactivate}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {showDone && (
        <DeactivateDoneModal onClose={finishClose} />
      )}
      {showAgreeWarn && (
        <AgreeWarnModal onClose={() => setShowAgreeWarn(false)} />
      )}
      {showPwWarn && (
        <PasswordWarnModal onClose={() => setShowPwWarn(false)} />
      )}
    </>
  );
}

const TABS = [
  { id: 'info',       label: '내 정보' },
  { id: 'apikey',     label: 'API Key 관리' },
  { id: 'usage',      label: '사용량 조회' },
  { id: 'deactivate', label: '계정 탈퇴', danger: true },
];

export default function MypagePage({ openPage, closePage, initialTab = 'info', user = null }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="mp-wrap">
      <div className="mp-sidebar">
        {TABS.map(t => (
          <button key={t.id}
            className={`mp-nav-item${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            style={t.danger ? { color: '#c0392b' } : {}}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mp-content">
        {activeTab === 'info'       && <InfoTab user={user} />}
        {activeTab === 'apikey'     && <ApiKeyTab openPage={openPage} />}
        {activeTab === 'usage'      && <UsageTab />}
        {activeTab === 'deactivate' && <DeactivateTab closePage={closePage} />}
      </div>
    </div>
  );
}
