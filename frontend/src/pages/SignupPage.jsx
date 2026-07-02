// SignupPage.jsx

import React, { useEffect, useRef, useState } from 'react';

const EMAIL_DOMAIN_OPTIONS = [
  { value: 'gmail.com', label: 'gmail.com' },
  { value: 'naver.com', label: 'naver.com' },
  { value: 'daum.net', label: 'daum.net' },
  { value: 'kakao.com', label: 'kakao.com' },
  { value: 'hanmail.net', label: 'hanmail.net' },
  { value: 'outlook.com', label: 'outlook.com' },
  { value: 'custom', label: '직접 입력' },
];

export default function SignupPage({ openPage }) {
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [emailLocalPart, setEmailLocalPart] = useState('');
  const [emailDomain, setEmailDomain] = useState('gmail.com');
  const [customEmailDomain, setCustomEmailDomain] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [isPrivacyHelpOpen, setIsPrivacyHelpOpen] = useState(false);
  const [isEmailDomainMenuOpen, setIsEmailDomainMenuOpen] = useState(false);
  const emailDomainControlRef = useRef(null);
  const customEmailDomainInputRef = useRef(null);

  const errorStyle = { border: '1.5px solid #c0392b' };
  const isCustomEmailDomain = emailDomain === 'custom';
  const selectedEmailDomain = emailDomain === 'custom' ? customEmailDomain.trim() : emailDomain;
  const finalEmail =
    emailLocalPart.trim() && selectedEmailDomain
      ? `${emailLocalPart.trim()}@${selectedEmailDomain}`
      : '';
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail);

  const getEmailErrorMessage = () => {
    if (!attempted) return '';
    if (!emailLocalPart.trim()) return '이메일 아이디를 입력해주세요.';
    if (!selectedEmailDomain) return '이메일 도메인을 선택하거나 입력해주세요.';
    if (!isEmailValid) return '올바른 이메일 형식이 아닙니다.';
    return '';
  };

  const emailErrorMessage = getEmailErrorMessage();

  const isValid =
    name.trim() && loginId.trim() && password.trim() &&
    passwordConfirm.trim() && isEmailValid && phone.trim() && agreed;

  useEffect(() => {
    if (!isPrivacyHelpOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPrivacyHelpOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPrivacyHelpOpen]);

  useEffect(() => {
    if (!isEmailDomainMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        emailDomainControlRef.current &&
        !emailDomainControlRef.current.contains(event.target)
      ) {
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

  const handleSignup = () => {
    if (!isValid) { setAttempted(true); return; }
    openPage('login');   // 'apply' → 'login'으로 변경
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSignup();
  };

  return (
    <div className="po-body" style={{ maxWidth: 480 }}>

      <h1 className="pg-h1" style={{ marginBottom: 20 }}>회원가입</h1>
      <p
        className="eyebrow"
        style={{
          marginTop: 0,
          marginBottom: 28,
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        계정을 만들고 API Key를 발급받으세요.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          className="pg-input"
          placeholder="이름"
          value={name}
          onChange={e => setName(e.target.value)}
          style={attempted && !name.trim() ? errorStyle : {}}
        />
        <input
          className="pg-input"
          placeholder="아이디"
          value={loginId}
          onChange={e => setLoginId(e.target.value)}
          style={attempted && !loginId.trim() ? errorStyle : {}}
        />
        <input
          className="pg-input"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={attempted && !password.trim() ? errorStyle : {}}
        />
        <input
          className="pg-input"
          type="password"
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
          style={attempted && !passwordConfirm.trim() ? errorStyle : {}}
        />
        <div>
          <div
            className={`signup-email-combo${emailErrorMessage ? ' is-error' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              border: '1.5px solid var(--line)',
              borderRadius: 12,
              background: '#fff',
              overflow: 'visible',
              ...(emailErrorMessage ? errorStyle : {}),
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
                    placeholder="도메인 입력 예: example.com"
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
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: 'var(--orange)',
                  fontSize: 13,
                  padding: 4,
                }}
              >
                <span aria-hidden="true">⌄</span>
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
          {emailErrorMessage && (
            <p className="signup-field-error" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#c0392b' }}>
              {emailErrorMessage}
            </p>
          )}
          <input type="hidden" name="email" value={finalEmail} readOnly />
        </div>
        <input
          className="pg-input"
          type="tel"
          placeholder="휴대폰 번호"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          style={attempted && !phone.trim() ? errorStyle : {}}
        />
        <div className="signup-agreement-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="signup-agreement-label" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink-soft)', cursor: 'pointer' }}>
            <span style={{ position: 'relative', width: 20, height: 20, flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  margin: 0,
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 6,
                  border: attempted && !agreed
                    ? '1.5px solid #c0392b'
                    : `1.5px solid ${agreed ? 'var(--orange)' : '#d8d0c4'}`,
                  background: agreed ? 'var(--orange)' : '#fff',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 12 10"
                  fill="none"
                  style={{
                    opacity: agreed ? 1 : 0,
                    transform: agreed ? 'scale(1)' : 'scale(0.6)',
                    transition: 'opacity 0.12s ease, transform 0.12s ease',
                  }}
                >
                  <path
                    d="M1 5L4.2 8L11 1"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
            <span>이용약관 및 개인정보처리방침 동의</span>
          </label>
          <button
            type="button"
            className="signup-privacy-help"
            aria-label="개인정보 처리 안내 보기"
            onClick={() => setIsPrivacyHelpOpen(true)}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '1.5px solid var(--line)',
              background: 'none',
              color: 'var(--muted)',
              fontSize: 12,
              lineHeight: 1,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ?
          </button>
        </div>
        <button
          className="pg-btn primary"
          style={{ width: '100%', padding: 15, fontSize: 16, cursor: isValid ? 'pointer' : 'not-allowed' }}
          onClick={handleSignup}
        >회원가입</button>
        <hr className="pg-divider"/>
        <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--ink-soft)' }}>
          이미 계정이 있으신가요?
          <button type="button" onClick={() => openPage('login')}
            style={{ background: 'none', border: 'none', color: 'var(--orange)', fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0, marginLeft: 4 }}>
            로그인
          </button>
        </div>
      </form>
      {isPrivacyHelpOpen && (
        <div
          className="signup-privacy-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) setIsPrivacyHelpOpen(false);
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(36,27,21,.45)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <section
            className="signup-privacy-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signup-privacy-title"
            style={{
              background: '#fff', borderRadius: 'var(--r)', padding: '28px 26px',
              width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)',
            }}
          >
            <div className="signup-privacy-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 id="signup-privacy-title" style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 18, fontWeight: 700 }}>개인정보 처리 안내</h2>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7, margin: '0 0 10px' }}>
              서비스 제공을 위해 이름, 아이디, 이메일, 휴대폰 번호 등 회원가입에 필요한 정보를 수집합니다.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7, margin: '0 0 10px' }}>
              수집된 정보는 계정 관리, 본인 확인, API Key 발급 및 서비스 이용 안내 목적으로만 사용됩니다.
            </p>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.7, margin: '0 0 20px' }}>
              자세한 약관은 추후 정식 서비스 정책에 맞춰 별도 제공될 예정입니다.
            </p>
            <button
              type="button"
              className="pg-btn primary signup-privacy-confirm"
              onClick={() => setIsPrivacyHelpOpen(false)}
              style={{ width: '100%', padding: 13 }}
            >
              확인
            </button>
          </section>
        </div>
      )}
    </div>
  );
}