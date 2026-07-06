// SignupPage.jsx

import React, { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import PasswordInput from '../components/PasswordInput';
import EmailInput from '../components/EmailInput';
import ClearableInput from '../components/ClearableInput';

const EMAIL_DOMAIN_OPTIONS = [
  { value: 'gmail.com', label: 'gmail.com' },
  { value: 'naver.com', label: 'naver.com' },
  { value: 'daum.net', label: 'daum.net' },
  { value: 'kakao.com', label: 'kakao.com' },
  { value: 'hanmail.net', label: 'hanmail.net' },
  { value: 'outlook.com', label: 'outlook.com' },
  { value: 'custom', label: '직접 입력' },
];

export default function SignupPage({ openPage, onLogin }) {
  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [idCheck, setIdCheck] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [checkedId, setCheckedId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [finalEmail, setFinalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);

  // attempted: 최종 "회원가입" 버튼을 눌렀을 때 전체 필드 에러 표시용
  const [attempted, setAttempted] = useState(false);
  // attemptedFields: Tab으로 개별 필드를 벗어났을 때 해당 필드만 에러 표시용
  const [attemptedFields, setAttemptedFields] = useState({});

  const [apiError, setApiError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPrivacyHelpOpen, setIsPrivacyHelpOpen] = useState(false);

  const errorStyle = { border: '1.5px solid #c0392b' };
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail);
  const isIdFormatValid = /^[a-zA-Z0-9]+$/.test(loginId.trim());
  const isIdAvailable = idCheck === 'available' && checkedId === loginId.trim();
  const isPasswordValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>/?`~]).{8,16}$/.test(password);
  const isPasswordMatch = password === passwordConfirm;

  const markAttempted = (field) => {
    setAttemptedFields((f) => ({ ...f, [field]: true }));
  };

  // 필드별 에러 표시 여부 (최종 제출 시도 또는 해당 필드 Tab 이탈 시도 시 true)
  const showNameError = (attempted || attemptedFields.name) && !name.trim();
  const showIdError = (attempted || attemptedFields.id) && (!loginId.trim() || !isIdFormatValid || !isIdAvailable);
  const showPasswordError = (attempted || attemptedFields.password) && !isPasswordValid;
  const showPasswordConfirmError = (attempted || attemptedFields.passwordConfirm) && !isPasswordMatch;
  const showEmailError = (attempted || attemptedFields.email) && !isEmailValid;
  const showPhoneError = (attempted || attemptedFields.phone) && !phone.trim();
  const showAgreedError = (attempted || attemptedFields.agreed) && !agreed;

  const hasInvalidIdChar = /[^a-zA-Z0-9]/.test(loginId);

  const handleCheckId = async () => {
    const id = loginId.trim();
    if (!id || hasInvalidIdChar) return;
    setIdCheck('checking');
    try {
      const { data } = await api.get('/auth/check-id', { params: { user_id: id } });
      setCheckedId(id);
      setIdCheck(data.available ? 'available' : 'taken');
    } catch {
      setIdCheck(null);
    }
  };

  const isValid =
    name.trim() && loginId.trim() && isIdFormatValid && isIdAvailable &&
    isPasswordValid && isPasswordMatch && isEmailValid && phone.trim() && agreed;

  useEffect(() => {
    if (!isPrivacyHelpOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsPrivacyHelpOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPrivacyHelpOpen]);

  const handleSignup = async () => {
    if (!isValid) { setAttempted(true); return; }
    setLoading(true);
    setApiError('');
    setPhoneError('');
    try {
      const { data } = await api.post('/auth/signup', {
        user_id: loginId.trim(),
        user_name: name.trim(),
        password,
        email: finalEmail,
        phone: phone.trim() || null,
      });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (onLogin) onLogin(data.user);
    } catch (err) {
      const detail = err.response?.data?.detail || '회원가입 중 오류가 발생했습니다.';
      if (detail.includes('전화번호')) {
        setPhoneError(detail);
      } else {
        setApiError(detail);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleSignup();
  };

  return (
    <div className="po-body" style={{ maxWidth: 480 }}>

      <h1 className="pg-h1" style={{ marginBottom: 20 }}>회원가입</h1>
      <p
        style={{
          marginTop: 0,
          marginBottom: 28,
          textAlign: 'center',
          fontSize: 15,
          color: 'var(--ink-soft)',
        }}
      >
        계정을 만들고 API Key를 발급받으세요.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ClearableInput
          placeholder="이름"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Tab' && !e.shiftKey && !name.trim()) {
              e.preventDefault();
              markAttempted('name');
            }
          }}
          style={showNameError ? errorStyle : {}}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ClearableInput
            placeholder="아이디"
            value={loginId}
            onChange={e => {
              setLoginId(e.target.value);
              setIdCheck(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCheckId();
              }
              if (e.key === 'Tab' && !e.shiftKey && !isIdAvailable) {
                e.preventDefault();
                markAttempted('id');
                if (loginId.trim() && idCheck !== 'checking') {
                  handleCheckId();
                }
              }
            }}
            style={{
              ...(showIdError || hasInvalidIdChar ? errorStyle : {}),
              ...(idCheck === 'taken' ? errorStyle : {}),
              ...(idCheck === 'checking' ? { opacity: 0.6 } : {}),
            }}
          />
          {hasInvalidIdChar && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>영문 · 숫자만 사용 가능합니다.</p>
          )}
          {isIdAvailable && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--orange)', fontWeight: 600 }}>
              <strong>{checkedId}</strong>는 사용 가능한 아이디입니다.
            </p>
          )}
          {idCheck === 'taken' && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>
              <strong>{checkedId}</strong>는 이미 사용 중인 아이디입니다.
            </p>
          )}
          {idCheck === 'checking' && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>확인 중...</p>
          )}
          {(attempted || attemptedFields.id) && !loginId.trim() && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>아이디를 입력해주세요.</p>
          )}
          {(attempted || attemptedFields.id) && loginId.trim() && !hasInvalidIdChar && !isIdAvailable && idCheck !== 'taken' && idCheck !== 'checking' && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>아이디 중복 확인이 필요합니다.</p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PasswordInput
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Tab' && !e.shiftKey && !isPasswordValid) {
                e.preventDefault();
                markAttempted('password');
              }
            }}
            style={showPasswordError ? errorStyle : {}}
          />
          <p style={{ margin: 0, fontSize: 12, color: showPasswordError ? '#c0392b' : 'var(--muted)' }}>
            8~16자 · 영문 대소문자 · 숫자 · 특수문자 포함
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <PasswordInput
            placeholder="비밀번호 확인"
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Tab' && !e.shiftKey && !isPasswordMatch) {
                e.preventDefault();
                markAttempted('passwordConfirm');
              }
            }}
            style={showPasswordConfirmError ? errorStyle : {}}
          />
          {showPasswordConfirmError && passwordConfirm && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>비밀번호가 일치하지 않습니다.</p>
          )}
        </div>
        <div>
          <EmailInput
            onChange={setFinalEmail}
            error={showEmailError}
            onKeyDown={e => {
              if (e.key === 'Tab' && !e.shiftKey && !isEmailValid) {
                e.preventDefault();
                markAttempted('email');
              }
            }}
          />
        </div>
        <div>
          <ClearableInput
            type="tel"
            placeholder="휴대폰 번호"
            value={phone}
            onChange={e => { setPhone(e.target.value.replace(/[^0-9]/g, '')); setPhoneError(''); }}
            onKeyDown={e => {
              if (e.key === 'Tab' && !e.shiftKey && !phone.trim()) {
                e.preventDefault();
                markAttempted('phone');
              }
            }}
            style={showPhoneError || phoneError ? errorStyle : {}}
          />
          {phoneError && (
            <p className="signup-field-error" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#c0392b' }}>
              {phoneError}
            </p>
          )}
        </div>
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
                  border: showAgreedError
                    ? '1.5px solid #c0392b'
                    : `1.5px solid ${agreed ? 'var(--orange-2)' : 'var(--line)'}`,
                  background: agreed ? 'var(--orange-2)' : 'var(--card)',
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
          style={{ width: '100%', padding: 15, fontSize: 16, cursor: isValid && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1 }}
          onClick={handleSignup}
          disabled={loading}
        >{loading ? '처리 중...' : '회원가입'}</button>
        {apiError && (
          <p style={{ margin: 0, fontSize: 13, color: '#c0392b', textAlign: 'center' }}>{apiError}</p>
        )}
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
              background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 26px',
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