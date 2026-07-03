// LoginPage.jsx

import React, { useState, useEffect } from 'react';
import ClearableInput from '../components/ClearableInput';

import api from '../api/axios';
import PasswordInput from '../components/PasswordInput';
import EmailInput from '../components/EmailInput';

/* ── 공통 모달 래퍼 ── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '32px 28px',
        width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted)', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── 아이디 찾기 모달 ── */
function FindIdModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [attempted, setAttempted] = useState(false);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleFind = () => {
    if (!isEmailValid) { setAttempted(true); return; }
    setStep(2);
  };

  return (
    <Modal title="아이디 찾기" onClose={onClose}>
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>가입 시 등록한 이메일로 아이디를 확인하세요.</p>
          <EmailInput onChange={setEmail} error={attempted && !isEmailValid} />
          <button
            type="button"
            className="pg-btn primary"
            style={{ width: '100%', padding: 13, opacity: email.trim() ? 1 : 0.5, cursor: email.trim() ? 'pointer' : 'not-allowed' }}
            onClick={handleFind}
          >아이디 찾기</button>
        </div>
      )}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>📧</div>
          <div>
            <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 16 }}>이메일로 아이디를 전송했습니다.</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>입력하신 이메일 받은편지함을 확인하세요.</p>
          </div>
          <div style={{ background: 'var(--peach)', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: 'var(--ink-soft)' }}>
            확인된 아이디: <strong style={{ color: 'var(--ink)' }}>user***</strong>
          </div>
          <button type="button" className="pg-btn primary" style={{ width: '100%', padding: 13 }} onClick={onClose}>로그인 화면으로</button>
        </div>
      )}
    </Modal>
  );
}

/* ── 비밀번호 찾기 모달 ── */
function FindPwModal({ onClose }) {
  const [step, setStep] = useState(1);

  // step 1
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [attempted1, setAttempted1] = useState(false);

  // step 2
  const [code, setCode] = useState('');
  const [attempted2, setAttempted2] = useState(false);

  // step 3
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [attempted3, setAttempted3] = useState(false);

  const errorStyle = { border: '1.5px solid #c0392b' };

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isStep1Valid = loginId.trim() && isEmailValid;
  const isStep3Valid = newPw.trim() && newPwConfirm.trim();

  const handleSend = () => {
    if (!isStep1Valid) { setAttempted1(true); return; }
    setStep(2);
  };

  const isCodeValid = /^\d{6}$/.test(code.trim());

  const handleVerify = () => {
    if (!isCodeValid) { setAttempted2(true); return; }
    setStep(3);
  };

  const handleChangePw = () => {
    if (!isStep3Valid) { setAttempted3(true); return; }
    setStep(4);
  };

  return (
    <Modal title="비밀번호 찾기" onClose={onClose}>
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>가입한 아이디와 이메일을 입력하면 인증코드를 발송합니다.</p>
          <ClearableInput
            placeholder="아이디"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            style={attempted1 && !loginId.trim() ? errorStyle : {}}
          />
          <EmailInput onChange={setEmail} error={attempted1 && !isEmailValid} />
          <button
            type="button"
            className="pg-btn primary"
            style={{ width: '100%', padding: 13, opacity: isStep1Valid ? 1 : 0.5, cursor: isStep1Valid ? 'pointer' : 'not-allowed' }}
            onClick={handleSend}
          >인증코드 발송</button>
        </div>
      )}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>이메일로 발송된 6자리 인증코드를 입력하세요.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <ClearableInput
              placeholder="인증코드 6자리"
              value={code}
              inputMode="numeric"
              maxLength={6}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              containerStyle={{ flex: 1 }}
              style={attempted2 && !isCodeValid ? errorStyle : {}}
            />
            <button type="button" className="pg-btn" style={{ whiteSpace: 'nowrap', padding: '0 14px', fontSize: 13 }} onClick={() => setStep(2)}>재발송</button>
          </div>
          {attempted2 && !isCodeValid && (
            <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>인증코드 6자리 숫자를 입력해주세요.</p>
          )}
          <button
            type="button"
            className="pg-btn primary"
            style={{ width: '100%', padding: 13, opacity: isCodeValid ? 1 : 0.5, cursor: isCodeValid ? 'pointer' : 'not-allowed' }}
            onClick={handleVerify}
          >인증 확인</button>
        </div>
      )}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)' }}>새 비밀번호를 입력하세요.</p>
          <PasswordInput
            placeholder="새 비밀번호"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            style={attempted3 && !newPw.trim() ? errorStyle : {}}
          />
          <PasswordInput
            placeholder="새 비밀번호 확인"
            value={newPwConfirm}
            onChange={e => setNewPwConfirm(e.target.value)}
            style={attempted3 && !newPwConfirm.trim() ? errorStyle : {}}
          />
          <button
            type="button"
            className="pg-btn primary"
            style={{ width: '100%', padding: 13, opacity: isStep3Valid ? 1 : 0.5, cursor: isStep3Valid ? 'pointer' : 'not-allowed' }}
            onClick={handleChangePw}
          >비밀번호 변경</button>
        </div>
      )}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div>
            <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: 16 }}>비밀번호가 변경되었습니다.</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>새 비밀번호로 로그인하세요.</p>
          </div>
          <button type="button" className="pg-btn primary" style={{ width: '100%', padding: 13 }} onClick={onClose}>로그인 화면으로</button>
        </div>
      )}
    </Modal>
  );
}

/* ── 메인 로그인 페이지 ── */
export default function LoginPage({ openPage, closePage, onLogin }) {
  const [modal, setModal] = useState(null); // null | 'findId' | 'findPw'
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [autoLogin, setAutoLogin] = useState(false);
  const [autofilled, setAutofilled] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('auto_login');
    if (!saved) return;
    try {
      const { id, pw } = JSON.parse(saved);
      setLoginId(id);
      setPassword(pw);
      setAutoLogin(true);
      setAutofilled(true);
      setTimeout(() => setAutofilled(false), 700);
    } catch { localStorage.removeItem('auto_login'); }
  }, []);

  const isValid = loginId.trim() && password.trim();
  const errorStyle = { border: '1.5px solid #c0392b' };

  const handleLogin = async () => {
    if (!isValid) { setAttempted(true); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', {
        user_id: loginId.trim(),
        password,
      });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (autoLogin) {
        localStorage.setItem('auto_login', JSON.stringify({ id: loginId.trim(), pw: password }));
      } else {
        localStorage.removeItem('auto_login');
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.detail || '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    handleLogin();
  };

  const handleSocialLogin = async (provider) => {
    const providerNames = { kakao: '카카오', naver: '네이버', google: '구글' };
    const providerName = providerNames[provider];
    if (!providerName) {
      setError('해당 간편 로그인은 아직 준비 중입니다.');
      return;
    }

    const randomValues = new Uint32Array(4);
    window.crypto.getRandomValues(randomValues);
    const state = Array.from(
      randomValues,
      value => value.toString(16).padStart(8, '0')
    ).join('');
    const stateStorageKey = `${provider}_oauth_state`;

    setLoading(true);
    setError('');
    sessionStorage.setItem(stateStorageKey, state);

    try {
      const { data } = await api.get(`/auth/${provider}/authorize-url`, {
        params: { state },
      });
      window.location.assign(data.authorize_url);
    } catch (err) {
      sessionStorage.removeItem(stateStorageKey);
      setError(err.response?.data?.detail || `${providerName} 로그인을 시작하지 못했습니다.`);
      setLoading(false);
    }
  };

  return (
    <>
      <div className="po-body" style={{ maxWidth: 480 }}>

        <h1 className="pg-h1" style={{ marginBottom: 20 }}>로그인</h1>
        <p
          style={{
            marginTop: 0,
            marginBottom: 28,
            textAlign: 'center',
            fontSize: 15,
            color: 'var(--ink-soft)',
          }}
        >
          계정에 로그인하세요.
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ClearableInput
            className={`pg-input${autofilled ? ' autofilled' : ''}`}
            placeholder="아이디"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            style={attempted && !loginId.trim() ? errorStyle : {}}
          />
          <PasswordInput
            className={`pg-input${autofilled ? ' autofilled' : ''}`}
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={attempted && !password.trim() ? errorStyle : {}}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
              padding: '2px 1px 0',
            }}
          >
            <label
              htmlFor="auto-login"
              title="공용 PC에서는 사용하지 마세요."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: autoLogin ? 'var(--orange-2)' : 'var(--ink-soft)',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'color .18s',
              }}
            >
              <input
                id="auto-login"
                type="checkbox"
                checked={autoLogin}
                onChange={e => setAutoLogin(e.target.checked)}
                style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
              />
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: `1.5px solid ${autoLogin ? 'var(--orange-2)' : 'var(--line)'}`,
                  background: autoLogin ? 'var(--orange-2)' : 'var(--card)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1,
                  transition: '.18s',
                  boxShadow: autoLogin ? '0 4px 12px -8px rgba(221,84,19,.8)' : 'none',
                }}
              >
                {autoLogin ? '✓' : ''}
              </span>
              자동 로그인
            </label>
          </div>

          <button
            type="submit"
            className="pg-btn primary"
            style={{
              width: '100%',
              padding: 15,
              fontSize: 16,
              cursor: isValid && !loading ? 'pointer' : 'not-allowed',
              opacity: loading ? 0.7 : 1,
            }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: '#c0392b', textAlign: 'center' }}>{error}</p>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              color: 'var(--muted)'
            }}
          >
            <button
              type="button"
              onClick={() => setModal('findId')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                fontSize: 13,
                padding: 0
              }}
            >
              아이디 찾기
            </button>

            <button
              type="button"
              onClick={() => setModal('findPw')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                fontSize: 13,
                padding: 0
              }}
            >
              비밀번호 찾기
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>또는 간편 로그인</span>
          <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => handleSocialLogin('kakao')}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: 13, borderRadius: 12, border: 'none',
              background: '#FEE500', color: '#3A1D1D', fontSize: 14.5, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#3A1D1D">
              <path d="M12 3C6.48 3 2 6.48 2 10.5c0 2.6 1.72 4.88 4.32 6.2-.19.68-.68 2.46-.78 2.85-.13.48.18.47.38.34.16-.1 2.5-1.68 3.52-2.36.5.07 1.02.11 1.56.11 5.52 0 10-3.48 10-7.14S17.52 3 12 3Z"/>
            </svg>
            카카오로 시작하기
          </button>

          <button
            type="button"
            onClick={() => handleSocialLogin('naver')}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: 13, borderRadius: 12, border: 'none',
              background: '#03C75A', color: '#fff', fontSize: 14.5, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
              <path d="M16.3 3v9.1L7.7 3H3v18h5.1v-9.1L16.7 21H21V3h-4.7Z"/>
            </svg>
            네이버로 시작하기
          </button>

          <button
            type="button"
            onClick={() => handleSocialLogin('google')}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: 13, borderRadius: 12,
              border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)',
              fontSize: 14.5, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"/>
            </svg>
            Google로 시작하기
          </button>
        </div>

        <hr className="pg-divider" />

          <div
            style={{
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--ink-soft)'
            }}
          >
            계정이 없으신가요?
            <button
              type="button"
              onClick={() => openPage('signup')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--orange)',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                padding: 0,
                marginLeft: 4
              }}
            >
              회원가입
            </button>
          </div>
        </form>
      </div>

      {modal === 'findId' && (
        <FindIdModal onClose={() => setModal(null)} />
      )}
      {modal === 'findPw' && (
        <FindPwModal onClose={() => setModal(null)} />
      )}
    </>
  );
}
