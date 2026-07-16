// MypagePage.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import GuideStepModal from '../components/GuideStepModal';
import PasswordInput, { EyeOpen, EyeOff } from '../components/PasswordInput';
import EmailInput from '../components/EmailInput';
import ClearableInput from '../components/ClearableInput';
import api from '../api/axios';
import kakaopayLogo from '../assets/kakao-pay-logo.png';
import tossLogo from '../assets/toss.png';

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
      <div style={{ background: 'var(--card)', borderRadius: 'var(--r)', padding: '32px 28px', width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-md)' }}>
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
  // CAPTCHA 데모 검증 성공 화면과 동일한 체크 UI (그라데이션 + 팝 애니메이션)
  return (
    <div className="demo-check-circle" style={{ margin: '0 auto', background: 'linear-gradient(135deg, var(--gold), var(--orange-2))' }}>
      <svg viewBox="0 0 34 34" fill="none" width={36} height={36} aria-hidden="true">
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
  const [attempted, setAttempted] = useState(false);
  const [currentError, setCurrentError] = useState('');
  const [formatError, setFormatError] = useState('');
  const [matchError, setMatchError] = useState('');
  const [checkingCurrent, setCheckingCurrent] = useState(false);

  const allFilled = current.trim() && next.trim() && confirm.trim();
  const isFormatValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,16}$/.test(next);

  const errorStyle = { border: '1.5px solid #c0392b' };

  const checkCurrentPassword = async () => {
    if (!current.trim()) return;
    setCheckingCurrent(true);
    try {
      await api.post('/auth/verify-password', { password: current });
      setCurrentError('');
    } catch (err) {
      setCurrentError(err.response?.data?.detail || '비밀번호가 일치하지 않습니다.');
    } finally {
      setCheckingCurrent(false);
    }
  };

  const handleChange = async () => {
    setFormatError('');
    setMatchError('');

    if (!allFilled) {
      setAttempted(true);
      return;
    }
    if (currentError) return;   // 이미 틀린 걸로 확인됐으면 여기서 중단

    // 현재 비밀번호를 아직 검증 안 했으면 여기서 한 번 더 확인
    try {
      await api.post('/auth/verify-password', { password: current });
    } catch (err) {
      setCurrentError(err.response?.data?.detail || '비밀번호가 일치하지 않습니다.');
      return;
    }

    if (!isFormatValid) {
      setFormatError('영문 대소문자·숫자·특수문자를 포함해 8~16자로 입력해주세요.');
      return;
    }
    if (next !== confirm) {
      setMatchError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      await api.post('/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      setDone(true);
    } catch (err) {
      setCurrentError(err.response?.data?.detail || '비밀번호 변경에 실패했습니다.');
    }
  };

  return (
    <Modal title="비밀번호 변경" onClose={onClose}>
      {!done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PasswordInput
            value={current}
            onChange={e => { setCurrent(e.target.value); setCurrentError(''); }}
            onBlur={checkCurrentPassword}
            placeholder="현재 비밀번호"
            style={(attempted && !current.trim()) || currentError ? errorStyle : {}}
          />
          {currentError && (
            <p style={{ margin: '-6px 0 0', fontSize: 12, color: '#c0392b' }}>{currentError}</p>
          )}
          <PasswordInput
            value={next}
            onChange={e => { setNext(e.target.value); setFormatError(''); }}
            placeholder="새 비밀번호"
            style={(attempted && !next.trim()) || formatError ? errorStyle : {}}
          />
          {formatError && (
            <p style={{ margin: '-6px 0 0', fontSize: 12, color: '#c0392b' }}>{formatError}</p>
          )}
          <PasswordInput
            value={confirm}
            onChange={e => { setConfirm(e.target.value); setMatchError(''); }}
            placeholder="새 비밀번호 확인"
            style={(attempted && !confirm.trim()) || matchError ? errorStyle : {}}
          />
          {matchError && (
            <p style={{ margin: '-6px 0 0', fontSize: 12, color: '#c0392b' }}>{matchError}</p>
          )}
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>8~16자 · 영문 대소문자 · 숫자 · 특수문자 포함</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="pg-btn" style={{ flex: 1, padding: 13 }} onClick={onClose}>취소</button>
            <button
              className="pg-btn primary"
              style={{ flex: 1, padding: 13, opacity: allFilled ? 1 : 0.5, cursor: allFilled ? 'pointer' : 'not-allowed' }}
              onClick={handleChange}
            >변경하기</button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
    <SuccessCheckIcon />
    <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>비밀번호가 변경되었습니다.</p>
    <button className="pg-btn primary" style={{ width: '100%', padding: 13 }} onClick={onClose}>확인</button>
  </div>
      )}
    </Modal>
  );
}

function EditInfoModal({ onClose, user, onUpdated }) {
  const [done, setDone] = useState(false);
  const [name, setName] = useState(user?.user_name || '');
  const [finalEmail, setFinalEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  // 이메일 변경 시 인증 (회원가입과 동일한 send-code/verify-code 재사용)
  const EMAIL_CODE_TTL = 180;
  const [emailSent, setEmailSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailTimeLeft, setEmailTimeLeft] = useState(EMAIL_CODE_TTL);
  const [emailSending, setEmailSending] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const errorStyle = { border: '1.5px solid #c0392b' };
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail);
  const originalEmail = (user?.email || '').trim().toLowerCase();
  const emailChanged = finalEmail.trim().toLowerCase() !== originalEmail;
  const isValid = name.trim() && isEmailValid && phone.trim() && (!emailChanged || emailVerified);

  // 이메일 입력이 바뀌면 인증 상태 초기화
  useEffect(() => {
    setEmailSent(false);
    setEmailVerified(false);
    setEmailCode('');
    setEmailTimeLeft(EMAIL_CODE_TTL);
    setVerifyError('');
    setApiError('');
  }, [finalEmail]);

  // 인증번호 유효시간 카운트다운
  useEffect(() => {
    if (!emailSent || emailVerified || emailTimeLeft <= 0) return undefined;
    const t = setInterval(() => setEmailTimeLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [emailSent, emailVerified, emailTimeLeft <= 0]);

  const handleSendCode = async () => {
    if (!isEmailValid || emailSending) return;
    setEmailSending(true);
    setVerifyError('');
    try {
      const { data } = await api.post('/auth/email/send-code', { email: finalEmail.trim() });
      setEmailSent(true);
      setEmailCode('');
      setEmailTimeLeft(data.ttl || EMAIL_CODE_TTL);
    } catch (err) {
      setVerifyError(err.response?.data?.detail || '인증 메일 발송에 실패했습니다.');
    } finally {
      setEmailSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) {
      setVerifyError('인증번호 6자리 숫자를 입력해주세요.');
      return;
    }
    setVerifyError('');
    try {
      await api.post('/auth/email/verify-code', { email: finalEmail.trim(), code: emailCode.trim() });
      setEmailVerified(true);
    } catch (err) {
      setVerifyError(err.response?.data?.detail || '인증에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    if (!isValid) { setAttempted(true); return; }
    setSaving(true);
    setApiError('');
    try {
      const { data } = await api.put('/auth/me', {
        user_name: name.trim(),
        email: finalEmail.trim(),
        phone: phone.trim(),
      });
      if (onUpdated) onUpdated(data.user);
      setDone(true);
    } catch (err) {
      setApiError(err.response?.data?.detail || '정보 수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
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

          <EmailInput
            onChange={setFinalEmail}
            error={attempted && !isEmailValid}
            initialEmail={user?.email || ''}
          />

          {/* 이메일이 원래 값과 달라지면 인증 절차 노출 */}
          {emailChanged && isEmailValid && !emailVerified && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="pg-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={!emailSent ? '변경한 이메일 인증이 필요합니다' : emailTimeLeft > 0 ? `인증번호 6자리 (${Math.floor(emailTimeLeft / 60)}:${String(emailTimeLeft % 60).padStart(2, '0')})` : '인증번호가 만료되었습니다'}
                  value={emailCode}
                  disabled={!emailSent || emailTimeLeft <= 0}
                  onChange={e => { setEmailCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); setVerifyError(''); }}
                  style={{ flex: 1, padding: '11px 12px', fontSize: 14 }}
                />
                {emailSent && (
                  <button
                    type="button"
                    className="pg-btn primary"
                    style={{ padding: '0 14px', fontSize: 13, whiteSpace: 'nowrap' }}
                    onClick={handleVerifyCode}
                  >확인</button>
                )}
                <button
                  type="button"
                  className="pg-btn"
                  style={{ padding: '0 14px', fontSize: 13, whiteSpace: 'nowrap', opacity: emailSending ? 0.5 : 1 }}
                  onClick={handleSendCode}
                  disabled={emailSending}
                >{emailSending ? '발송 중...' : emailSent ? '재발송' : '인증번호 전송'}</button>
              </div>
              {verifyError && (
                <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>{verifyError}</p>
              )}
              {attempted && !emailVerified && !verifyError && (
                <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>변경한 이메일의 인증을 완료해주세요.</p>
              )}
            </div>
          )}
          {emailChanged && emailVerified && (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--orange)', fontWeight: 600 }}>이메일 인증이 완료되었습니다.</p>
          )}

          <ClearableInput
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="휴대폰 번호"
            style={attempted && !phone.trim() ? errorStyle : {}}
          />
          {apiError && (
            <p style={{ margin: 0, fontSize: 13, color: '#c0392b' }}>{apiError}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="pg-btn" style={{ flex: 1, padding: 13 }} onClick={onClose}>취소</button>
            <button
              className="pg-btn primary"
              style={{ flex: 1, padding: 13, opacity: isValid && !saving ? 1 : 0.5, cursor: isValid && !saving ? 'pointer' : 'not-allowed' }}
              onClick={handleSave}
              disabled={saving}
            >{saving ? '저장 중...' : '저장'}</button>
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
function InfoTab({ user, onUserUpdate, profile }) {
  const [modal, setModal] = useState(null); // null | 'pw' | 'edit'

  const readOnlyInputStyle = {
    background: 'var(--paper)',
    cursor: 'default',
    caretColor: 'transparent',
  };
  const preventFocus = (e) => e.target.blur();
  // 소셜 로그인 응답에는 created_at이 없을 수 있어 서버 프로필(/auth/me)을 우선 사용
  const joinDateSource = profile?.created_at || user?.created_at;
  const joinDate = joinDateSource ? String(joinDateSource).slice(0, 10) : '-';
  const planLabel = profile?.plan_name || '-';
  // 비밀번호 보유 여부: 서버 프로필이 있으면 그 값을, 로딩 전에는 아이디 형태로 추정
  const looksSocial = /^(kakao|naver|google)_/.test(user?.user_id || '');
  const hasPassword = profile ? Boolean(profile.has_password) : !looksSocial;

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
            value={planLabel}
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
            onChange={() => {}}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>가입일</div>
          <input
            className="pg-input"
            value={joinDate}
            readOnly
            style={readOnlyInputStyle}
            onFocus={preventFocus}
            onChange={() => {}}
          />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {/* 간편(소셜) 로그인 계정은 우리 서비스에 비밀번호가 없으므로 변경 메뉴를 숨김.
              프로필 로딩 전에는 소셜 아이디 형태(provider_ 프리픽스)로 추정해 버튼 깜박임 방지 */}
          {hasPassword && (
            <button className="pg-btn" onClick={() => setModal('pw')}>비밀번호 변경</button>
          )}
          <button className="pg-btn" onClick={() => setModal('edit')}>정보 수정</button>
        </div>
        {!hasPassword && (
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
            간편 로그인으로 가입한 계정은 비밀번호를 소셜 플랫폼에서 관리합니다.
          </p>
        )}
      </div>

      {modal === 'pw'   && <ChangePwModal onClose={() => setModal(null)} />}
      {modal === 'edit' && <EditInfoModal onClose={() => setModal(null)} user={user} onUpdated={onUserUpdate} />}
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
};

function addMonths(dateString, months) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

/* ── SC-08 API Key 탭 ── */
function ApiKeyTab({ closePage }) {
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [plainKey, setPlainKey] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [siteDomain, setSiteDomain] = useState('');
  const [visible, setVisible] = useState(false);
  const [copyLabel, setCopyLabel] = useState('복사');
  const [siteKeyCopyLabel, setSiteKeyCopyLabel] = useState('복사');
  const [showReissueConfirm, setShowReissueConfirm] = useState(false);
  const [showReissueDone, setShowReissueDone] = useState(false);
  const [guideStep, setGuideStep] = useState(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        const { data } = await api.get('/api-keys/current');
        if (!ignore) {
          setPlan(data.plan || null);
          setApiKey(data.api_key || null);
          setSiteKey(data.api_key?.site_key || '');
          setSiteDomain(data.api_key?.site_domain || '');
        }
      } catch (err) {
        if (!ignore) setActionError(err.response?.data?.detail || 'API Key 정보를 불러오지 못했습니다.');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => { ignore = true; };
  }, []);

  const copy = () => {
    if (!plainKey) return;
    navigator.clipboard.writeText(plainKey).catch(() => {});
    setCopyLabel('복사됨 ✓');
    setTimeout(() => setCopyLabel('복사'), 1500);
  };

  const copySiteKey = () => {
    if (!siteKey) return;
    navigator.clipboard.writeText(siteKey).catch(() => {});
    setSiteKeyCopyLabel('복사됨 ✓');
    setTimeout(() => setSiteKeyCopyLabel('복사'), 1500);
  };

  const applyIssuedKey = (data) => {
  setApiKey(data.api_key);
  if (data.plain_key) {
    setPlainKey(data.plain_key);
    setVisible(true);
  }
  setSiteKey(data.site_key || data.api_key?.site_key || '');
  setSiteDomain(data.api_key?.site_domain || '');
  setActionError('');
};

  const issue = async () => {
    if (!siteDomain.trim()) {
      setActionError('Site Key를 사용할 사이트 도메인을 입력해 주세요.');
      return;
    }
    setActionPending(true);
    setActionError('');
    try {
      const { data } = await api.post('/api-keys', { site_domain: siteDomain });
      applyIssuedKey(data);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'API Key 발급에 실패했습니다.');
    } finally {
      setActionPending(false);
    }
  };

  const [reissueTarget, setReissueTarget] = useState(null); // 'secret' | 'site'

const requestReissueSecret = () => {
  if (!isKeyActive) {
    setActionError('비활성화된 계정에서는 Key를 재발급할 수 없습니다.');
    return;
  }
  setReissueTarget('secret');
  setShowReissueConfirm(true);
};

const requestReissueSite = () => {
  if (!isKeyActive) {
    setActionError('비활성화된 계정에서는 Key를 재발급할 수 없습니다.');
    return;
  }
  setReissueTarget('site');
  setShowReissueConfirm(true);
};

const doReissue = async () => {
  setShowReissueConfirm(false);
  setActionPending(true);
  setActionError('');
  try {
    const { data } = await api.post('/api-keys/reissue', {
      site_domain: siteDomain,
      target: reissueTarget, // 'secret' | 'site'
    });
    applyIssuedKey(data);
    setShowReissueDone(true);
  } catch (err) {
    setActionError(err.response?.data?.detail || 'API Key 재발급에 실패했습니다.');
  } finally {
    setActionPending(false);
  }
};

  const saveSiteDomain = async () => {
    if (!siteDomain.trim()) {
      setActionError('Site Key를 사용할 사이트 도메인을 입력해 주세요.');
      return;
    }
    setActionPending(true);
    setActionError('');
    try {
      const { data } = await api.put('/api-keys/current/site-domain', { site_domain: siteDomain });
      setApiKey(data.api_key);
      setSiteDomain(data.api_key?.site_domain || '');
    } catch (err) {
      setActionError(err.response?.data?.detail || '사이트 도메인 저장에 실패했습니다.');
    } finally {
      setActionPending(false);
    }
  };

  const goToPricing = () => {
    closePage?.();
    setTimeout(() => {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 320);
  };

  if (loading) {
    return (
      <>
        <h2 className="pg-h2 mp-api-key-title" style={{ marginBottom: 20 }}>API Key 관리</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>API Key 정보를 확인하는 중입니다...</p>
      </>
    );
  }

  // 조회 자체가 실패한 경우: '요금제 미가입' 화면으로 오해하게 두지 않고 에러를 명확히 표시
  if (!plan && actionError) {
    return (
      <>
        <h2 className="pg-h2 mp-api-key-title" style={{ marginBottom: 20 }}>API Key 관리</h2>
        <div className="pg-card" style={{ maxWidth: 640, textAlign: 'center', padding: '48px 24px' }}>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>API Key 정보를 불러오지 못했습니다</strong>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--bad)' }}>{actionError}</p>
        </div>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        <h2 className="pg-h2 mp-api-key-title" style={{ marginBottom: 20 }}>API Key 관리</h2>
        <div className="pg-card" style={{ maxWidth: 640, textAlign: 'center', padding: '48px 24px' }}>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>요금제 활성화 후 이용 가능합니다</strong>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--muted)' }}>
            API Key는 활성 요금제가 있는 계정에만 발급됩니다.
          </p>
          <button className="pg-btn primary" onClick={goToPricing}>요금제 선택하기</button>
        </div>
      </>
    );
  }

  if (!apiKey) {
    return (
      <>
        <h2 className="pg-h2 mp-api-key-title" style={{ marginBottom: 20 }}>API Key 관리</h2>
        <div className="pg-card" style={{ maxWidth: 640, textAlign: 'center', padding: '48px 24px' }}>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 8 }}>Site Key와 Secret Key를 발급해 주세요</strong>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--muted)' }}>
            {plan.name} 요금제가 활성화되어 있습니다. Secret Key 원문은 한 번만 표시됩니다.
          </p>
          <label htmlFor="new-site-domain" style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700 }}>사이트 도메인</label>
          <input
            id="new-site-domain"
            className="pg-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="example.com"
            value={siteDomain}
            onChange={(event) => setSiteDomain(event.target.value)}
            style={{ marginBottom: 12 }}
          />
          <p style={{ margin: '-4px 0 16px', fontSize: 12, color: 'var(--muted)' }}>프로토콜과 경로 없이 입력해 주세요. 개발 환경은 localhost를 사용할 수 있습니다.</p>
          <button className="pg-btn primary" onClick={issue} disabled={actionPending}>
            {actionPending ? '발급 중...' : '키 발급'}
          </button>
        </div>
        {actionError && <p style={{ color: 'var(--bad)', fontSize: 13, marginTop: 12 }}>{actionError}</p>}
      </>
    );
  }

  const issuedAt = apiKey.created_at ? String(apiKey.created_at).slice(0, 10) : '-';
  const expiresAt = apiKey.created_at ? addMonths(issuedAt, 1) : '-';
  const displayedKey = visible && plainKey ? plainKey : apiKey.masked_key;
  const isKeyActive = apiKey.is_active !== false;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <h2 className="pg-h2 mp-api-key-title" style={{ margin: 0 }}>API Key 관리</h2>
      </div>

      {!isKeyActive && (
        <p style={{ margin: '0 0 16px', color: 'var(--bad)', fontSize: 13.5, fontWeight: 500, lineHeight: 1.5 }}>
          이 계정은 현재 비활성화 상태라 이 키로는 CAPTCHA 요청이 처리되지 않습니다.
        </p>
      )}

      <div className="api-key-stack">
        <section className="pg-card api-key-section api-key-secret-section" aria-labelledby="secret-key-heading">
          <div className="api-key-section-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 id="secret-key-heading" style={{ margin: 0 }}>서버 검증용 비공개 키</h4>
              <span className={`api-key-status${isKeyActive ? ' active' : ' inactive'}`}>
                <i aria-hidden="true" />{isKeyActive ? '사용 중' : '비활성화'}
              </span>
            </div>
            <div className="api-key-heading-actions">
              <button className="pg-btn primary" onClick={requestReissueSecret} disabled={actionPending}>
                {actionPending ? '처리 중...' : '키 재발급'}
              </button>
            </div>
          </div>
          <div className="api-key-key-row">
            <code>{displayedKey}</code>
            <div className="api-key-controls">
            <button
              className="pg-btn"
              style={{ padding: '7px 10px', fontSize: 13, display: 'flex', alignItems: 'center' }}
              onClick={() => setVisible((value) => !value)}
              disabled={!plainKey}
              aria-label={visible ? 'Secret Key 숨기기' : 'Secret Key 조회'}
              title={visible ? 'Secret Key 숨기기' : 'Secret Key 조회'}
            >
              {visible ? <EyeOpen /> : <EyeOff />}
            </button>
            <button className="pg-btn" style={{ padding: '7px 12px', fontSize: 13 }} onClick={copy} disabled={!plainKey}>{copyLabel}</button>
            </div>
          </div>
          <p className="api-key-field-help" style={{ marginTop: 12, marginBottom: 0 }}>
            {plainKey ? '지금 원문을 복사해 보관하세요. 페이지를 벗어나면 다시 조회할 수 없습니다.' : '원문은 저장되지 않습니다. 새 원문이 필요하면 재발급해 주세요.'}
          </p>
          <dl className="api-key-meta">
            <div><dt>발급일</dt><dd>{issuedAt}</dd></div>
            <div><dt>만료일</dt><dd>{expiresAt}</dd></div>
            <div><dt>요금제</dt><dd>{plan.name}</dd></div>
          </dl>
        </section>

        <section className="pg-card api-key-section api-key-site-section" aria-labelledby="site-key-heading">
          <div className="api-key-section-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h4 id="site-key-heading" style={{ margin: 0 }}>프론트엔드 위젯용 공개 키</h4>
              <span className={`api-key-status${isKeyActive ? ' active' : ' inactive'}`}>
                <i aria-hidden="true" />{isKeyActive ? '사용 중' : '비활성화'}
              </span>
            </div>
            <div className="api-key-heading-actions">
              <button className="pg-btn primary" onClick={requestReissueSite} disabled={actionPending}>
                {actionPending ? '처리 중...' : '키 재발급'}
              </button>
            </div>
          </div>
          <div className={`api-key-key-row${!siteKey ? ' is-error' : ''}`}>
            <code className={!siteKey ? 'muted' : ''}>
              {siteKey || 'Site Key 정보를 불러오지 못했습니다.'}
            </code>
            {siteKey && (
              <button className="pg-btn" onClick={copySiteKey}>{siteKeyCopyLabel}</button>
            )}
          </div>
        </section>

        <section className="pg-card api-key-section api-key-domain-section" aria-labelledby="site-domain-heading">
          <div className="api-key-section-heading">
            <div>
            <span className="api-key-section-label">ALLOWED DOMAIN</span>
             <h4 id="site-domain-heading" style={{ margin: 0 }}>허용 사이트 도메인</h4>
            </div>
          </div>
          <div className="api-key-domain-form">
            <input
              id="current-site-domain"
              className="pg-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="example.com"
              value={siteDomain}
              onChange={(event) => setSiteDomain(event.target.value)}
            />
            <button className="pg-btn" onClick={saveSiteDomain} disabled={actionPending}>저장</button>
          </div>
          {!siteDomain.trim() ? (
            <p className="api-key-field-error" role="alert">Site Key를 사용할 사이트 도메인을 등록해 주세요.</p>
          ) : actionError ? (
            <p className="api-key-field-error" role="alert">{actionError}</p>
          ) : (
            <p className="api-key-field-help">example.com처럼 프로토콜과 경로를 제외한 호스트명만 입력해 주세요.</p>
          )}
        </section>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            className="pg-btn"
            style={{ fontSize: 13, padding: '8px 14px' }}
            onClick={() => setGuideStep(0)}
          >
            사용 가이드 보기
          </button>
        </div>
      </div>

      {showReissueConfirm && (
        <ReissueConfirmModal
          onConfirm={doReissue}
          onClose={() => setShowReissueConfirm(false)}
        />
      )}
      {showReissueDone && (
        <ReissueDoneModal
          onClose={() => setShowReissueDone(false)}
          target={reissueTarget}
        />
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

const TODAY_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_USAGE_START_DATE = addDays(TODAY_DATE, -29);
const DEFAULT_USAGE_END_DATE = TODAY_DATE;
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const USAGE_TABLE_PAGE_SIZE = 10;
const PAYMENT_TABLE_PAGE_SIZE = 10;

function getSuccessRate(row) {
  if (!row.issued) return '-';
  return `${((row.verified / row.issued) * 100).toFixed(1)}%`;
}

function TablePagination({ page, totalPages, onChange, ariaLabel }) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
      <button
        className="pg-btn"
        type="button"
        aria-label="이전 페이지"
        style={{ padding: '7px 12px', fontSize: 13 }}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        ‹
      </button>
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
        <button
          key={pageNumber}
          className="pg-btn"
          type="button"
          aria-current={pageNumber === page ? 'page' : undefined}
          style={{
            padding: '7px 14px',
            fontSize: 13,
            ...(pageNumber === page ? { background: 'var(--orange)', color: '#fff', borderColor: 'var(--orange)' } : {}),
          }}
          onClick={() => onChange(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        className="pg-btn"
        type="button"
        aria-label="다음 페이지"
        style={{ padding: '7px 12px', fontSize: 13 }}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        ›
      </button>
    </nav>
  );
}

function UsageLineChart({ data, labelKey, valueKey = 'issued', emptyMessage }) {
  const max = Math.max(0, ...data.map((row) => row[valueKey]));

  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data.length || max === 0) {
    return <div className="usage-empty-state">{emptyMessage}</div>;
  }

  // viewBox 좌표계 (preserveAspectRatio="none"으로 컨테이너에 맞춰 늘어남)
  const W = 300;
  const H = 120;
  const TOP_PAD = 8;
  const points = data.map((row, i) => {
    const x = data.length === 1 ? W / 2 : (i / (data.length - 1)) * W;
    const y = H - ((row[valueKey] / max) * (H - TOP_PAD));
    return [x, y];
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  return (
    <div className="usage-chart-line" style={{ height: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }}>
        <path d={areaPath} fill="url(#usage-line-fill)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--orange)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <defs>
          <linearGradient id="usage-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--orange)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--orange)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
      </svg>
      {/* 호버: 가이드선 + 선 위의 점 + 값 말풍선 */}
      {hoverIndex !== null && (() => {
        const [px, py] = points[hoverIndex];
        const leftPct = (px / W) * 100;
        // svg는 컨테이너에서 top 8px, height (100%-8px)를 차지하므로 그에 맞춰 환산
        const yRatio = py / H;
        const topCss = `calc(${(yRatio * 100).toFixed(2)}% + ${(8 - yRatio * 8).toFixed(2)}px)`;
        const row = data[hoverIndex];
        const nearLeft = leftPct < 15;
        const nearRight = leftPct > 85;
        return (
          <>
            <div className="usage-chart-line-guide" style={{ left: `${leftPct}%` }} />
            <div className="usage-chart-line-dot" style={{ left: `${leftPct}%`, top: topCss }} />
            <div
              className="usage-chart-line-tooltip"
              style={{
                left: `${leftPct}%`,
                transform: nearLeft
                  ? 'translate(-12px, -100%)'
                  : nearRight
                    ? 'translate(calc(-100% + 12px), -100%)'
                    : 'translate(-50%, -100%)',
              }}
            >
              <b>{row[labelKey]}</b>
              <span>{formatNumber(row[valueKey])}회</span>
            </div>
          </>
        );
      })()}
      <div className="usage-chart-line-hover" onMouseLeave={() => setHoverIndex(null)}>
        {data.map((row, i) => (
          <div
            key={row[labelKey]}
            className="usage-chart-line-slot"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── SC-09 사용량 탭 ── */
function UsageTab() {
  const [dailyUsageData, setDailyUsageData] = useState([]);
  const [monthlyUsageData, setMonthlyUsageData] = useState([]);
  const [usageSummary, setUsageSummary] = useState({
    currentMonthIssued: 0,
    apiLimit: 0,
    planName: '',
  });
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedRange, setAppliedRange] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(DEFAULT_USAGE_END_DATE.slice(0, 7));
  const [dateError, setDateError] = useState('');
  const [usageTablePage, setUsageTablePage] = useState(1);
  const datePickerRef = useRef(null);

  useEffect(() => {
    let ignore = false;

    api.get('/usage/summary')
      .then(({ data }) => {
        if (ignore) return;
        setDailyUsageData(data.daily || []);
        setMonthlyUsageData(data.monthly || []);
        setUsageSummary({
          currentMonthIssued: Number(data.current_month_issued || 0),
          apiLimit: Number(data.api_limit || 0),
          planName: data.plan_name || '',
        });
        setUsageError('');
      })
      .catch((err) => {
        if (ignore) return;
        setUsageError(err.response?.data?.detail || '사용량 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!ignore) setUsageLoading(false);
      });

    return () => { ignore = true; };
  }, []);

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
    dailyUsageData.filter((row) => (
      row.date >= activeRange.start && row.date <= activeRange.end
    ))
  ), [activeRange.start, activeRange.end, dailyUsageData]);

  const usageTableRows = useMemo(() => (
    [...filteredDailyUsageData].reverse()
  ), [filteredDailyUsageData]);

  const usageTableTotalPages = Math.max(1, Math.ceil(usageTableRows.length / USAGE_TABLE_PAGE_SIZE));
  const paginatedUsageTableRows = useMemo(() => {
    const start = (usageTablePage - 1) * USAGE_TABLE_PAGE_SIZE;
    return usageTableRows.slice(start, start + USAGE_TABLE_PAGE_SIZE);
  }, [usageTablePage, usageTableRows]);

  useEffect(() => {
    setUsageTablePage((page) => Math.min(page, usageTableTotalPages));
  }, [usageTableTotalPages]);

  const periodLabel = appliedRange
    ? appliedRange.start === appliedRange.end
      ? appliedRange.start
      : `${appliedRange.start} ~ ${appliedRange.end}`
    : '기간 선택';

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const usagePercent = usageSummary.apiLimit > 0
    ? Math.min((usageSummary.currentMonthIssued / usageSummary.apiLimit) * 100, 100)
    : 0;

  // 조회 기간 최대 1개월 제한
  const isWithinOneMonth = (start, end) => {
    const limit = new Date(start);
    limit.setMonth(limit.getMonth() + 1);
    return new Date(end) <= limit;
  };

  const selectCalendarDate = (dateString) => {
    if (dateString > TODAY_DATE) return;
    setDateError('');

    if (!startDate || endDate) {
      setStartDate(dateString);
      setEndDate('');
      setCalendarMonth(dateString.slice(0, 7));
      return;
    }

    const [nextStart, nextEnd] = dateString < startDate
      ? [dateString, startDate]
      : [startDate, dateString];

    if (!isWithinOneMonth(nextStart, nextEnd)) {
      setDateError('조회 기간은 최대 1개월까지 선택할 수 있습니다.');
      return;
    }

    setStartDate(nextStart);
    setEndDate(nextEnd);
    setCalendarMonth(dateString.slice(0, 7));
  };

  const getDateCellClassName = (day) => {
  const hasRange = startDate && endDate;
  const isStart = day.date === startDate;
  const isEnd = day.date === endDate;
  const isInRange = hasRange && day.date >= startDate && day.date <= endDate;
  const isFuture = day.date > TODAY_DATE;

  return [
    'usage-calendar-day',
    !day.isCurrentMonth ? 'muted' : '',
    day.date === TODAY_DATE ? 'today' : '',
    isInRange ? 'in-range' : '',
    isStart || isEnd ? 'selected' : '',
    isStart ? 'range-start' : '',
    isEnd ? 'range-end' : '',
    isFuture ? 'future' : '',
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
    if (!isWithinOneMonth(normalizedStart, normalizedEnd)) {
      setDateError('조회 기간은 최대 1개월까지 선택할 수 있습니다.');
      return;
    }

    setAppliedRange({ start: normalizedStart, end: normalizedEnd });
    setUsageTablePage(1);
    setDateError('');
    setIsDatePickerOpen(false);
  };

  const resetDateRange = () => {
    setStartDate('');
    setEndDate('');
    setCalendarMonth(DEFAULT_USAGE_END_DATE.slice(0, 7));
    setAppliedRange(null);
    setUsageTablePage(1);
    setDateError('');
  };

  const downloadCsv = () => {
    const header = ['날짜', 'CAPTCHA 발급', 'CAPTCHA 검증', '성공률'];
    const rows = usageTableRows.map((row) => [
      row.date, row.issued, row.verified, getSuccessRate(row),
    ]);
    // ﻿(BOM): 엑셀에서 한글 헤더가 깨지지 않게
    const csv = '﻿' + [header, ...rows].map((cols) => cols.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage_${activeRange.start}_${activeRange.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
                  <span><b>시작일</b>{startDate || '-'}</span>
                  <span><b>종료일</b>{endDate || '-'}</span>
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
                      disabled={day.date > TODAY_DATE}
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
          <button
            className="pg-btn"
            type="button"
            style={{ fontSize: 13, padding: '8px 14px', opacity: usageTableRows.length ? 1 : 0.5, cursor: usageTableRows.length ? 'pointer' : 'not-allowed' }}
            disabled={!usageTableRows.length}
            onClick={downloadCsv}
          >CSV 다운로드</button>
        </div>
      </div>
      <div className="pg-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
          <span>이번 달 CAPTCHA 발급량</span>
          <strong>
            {usageLoading
              ? '불러오는 중...'
              : `${formatNumber(usageSummary.currentMonthIssued)} / ${formatNumber(usageSummary.apiLimit)}회`}
          </strong>
        </div>
        <div className="usage-bar-wrap"><div className="usage-bar" style={{ width: `${usagePercent}%` }}/></div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>
          {usageSummary.apiLimit > 0
            ? `한도의 ${Math.round(usagePercent)}% 사용 중 (${usageSummary.planName} 요금제 api_limit 기준)`
            : '적용된 API 호출 한도가 없습니다.'}
        </p>
        {usageError && (
          <p style={{ fontSize: 12, color: 'var(--bad)', margin: '6px 0 0' }}>{usageError}</p>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          gap: 16,
          marginBottom: 20,
          boxSizing: 'border-box',
        }}
      >
        <div
          className="pg-card"
          style={{
            flex: '1 1 300px',
            boxSizing: 'border-box',
            height: 220,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="pg-label" style={{ margin: 0, flex: '0 0 auto' }}>일별 호출량 ({appliedRange ? '선택 기간' : '최근 30일'})</div>
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <UsageLineChart
              data={filteredDailyUsageData}
              labelKey="date"
              emptyMessage="선택한 기간의 사용량 데이터가 없습니다."
            />
          </div>
        </div>
        <div
          className="pg-card"
          style={{
            flex: '1 1 300px',
            boxSizing: 'border-box',
            height: 220,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="pg-label" style={{ margin: 0, flex: '0 0 auto' }}>월별 호출량 (최근 12개월)</div>
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <UsageLineChart
              data={monthlyUsageData}
              labelKey="month"
              emptyMessage="월별 사용량 데이터가 없습니다."
            />
          </div>
        </div>
      </div>
      <table className="pg-table table-ink-orange">
        <thead><tr><th style={{ textAlign: 'left' }}>날짜</th><th style={{ textAlign: 'left' }}>CAPTCHA 발급</th><th style={{ textAlign: 'left' }}>CAPTCHA 검증</th><th style={{ textAlign: 'left' }}>성공률</th></tr></thead>
        <tbody>
          {usageTableRows.length > 0 ? (
            paginatedUsageTableRows.map((row) => (
              <tr key={row.date}>
                <td style={{ textAlign: 'left' }}>{row.date}</td>
                <td style={{ textAlign: 'left' }}>{formatNumber(row.issued)}</td>
                <td style={{ textAlign: 'left' }}>{formatNumber(row.verified)}</td>
                <td style={{ textAlign: 'left' }}>{getSuccessRate(row)}</td>
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
      <TablePagination
        ariaLabel="사용량 상세 페이지"
        page={usageTablePage}
        totalPages={usageTableTotalPages}
        onChange={setUsageTablePage}
      />
    </>
  );
}

const STATUS_STYLE = {
  '완료':   { tone: 'success', background: 'rgba(46,158,107,.15)', color: 'var(--ok)' },
  '환불':   { tone: 'danger',  background: 'rgba(216,73,47,.15)', color: 'var(--bad)' },
  '실패':   { tone: 'danger',  background: 'rgba(216,73,47,.15)', color: 'var(--bad)' },
  '대기':   { tone: 'warning', background: 'var(--peach)', color: 'var(--orange-2)' },
};

// 관리자 상태 배지와 동일한 룩: 다크모드에서만 CSS 변수가 정의되어
// 네이비 배경 + 글씨색 링 + 글로우 적용, 라이트모드는 기존 틴트 그대로
function paymentBadgeStyle(status) {
  const s = STATUS_STYLE[status] || { tone: 'neutral', background: 'transparent', color: 'var(--ink-soft)' };
  return {
    color: `var(--status-badge-ink-${s.tone}, ${s.color})`,
    background: `var(--status-badge-bg, ${s.background})`,
    boxShadow: 'var(--status-badge-fx, none)',
  };
}

/* ── 결제 수단 로고 ── */
const PAY_BADGE_LOGO = {
  kakao: kakaopayLogo,
  toss: tossLogo,
};

function PayBadge({ provider, fallback }) {
  const logo = PAY_BADGE_LOGO[provider];
  if (!logo) return fallback ?? null;
  return <img src={logo} alt={provider} className={`pay-badge-logo ${provider}`} />;
}

function CancelSubscriptionModal({ onConfirm, onClose, loading, errorMessage }) {
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText.trim() === '해지' && !loading;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 380, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--peach)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path d="M12 8v5M12 16.5h.01" stroke="var(--orange-2)" strokeWidth="2.2" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="9" stroke="var(--orange-2)" strokeWidth="1.8"/>
          </svg>
        </div>
        <div>
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 6 }}>정말 구독을 해지하시겠어요?</strong>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            결제하신 기간 동안은 Pro 요금제를 계속 이용하실 수 있고,<br/>
            기간이 끝나면 자동으로 요금제가 해지되어 API Key도 정지됩니다.
          </span>
        </div>
        <div style={{ width: '100%', textAlign: 'left', position: 'relative' }}>
          <input
            className="pg-input"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            aria-label="계속하려면 해지를 입력하세요"
            disabled={loading}
          />
          {!confirmText && (
            <span style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted)',
              fontSize: 15,
              pointerEvents: 'none',
            }}>
              계속하려면 <strong>해지</strong>를 입력하세요
            </span>
          )}
        </div>
        {errorMessage && (
          <p style={{ margin: 0, fontSize: 12.5, color: '#c0392b' }}>{errorMessage}</p>
        )}
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <button className="pg-btn" style={{ flex: 1, padding: 11 }} onClick={onClose} disabled={loading}>취소</button>
          <button
            className="pg-btn danger"
            style={{ flex: 1, padding: 11, opacity: canConfirm ? 1 : 0.5, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
            onClick={() => onConfirm(confirmText)}
            disabled={!canConfirm}
          >
            {loading ? '처리 중...' : '해지하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingTab({ closePage, profile, onProfileRefresh }) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/payments/history');
        if (!ignore) setPayments(data.payments || []);
      } catch {
        if (!ignore) setPayments([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const isPro = profile?.plan_name === 'Pro';
  const hasPlan = Boolean(profile?.plan_name);
  const latestPayment = payments[0] || null;
  const paymentTotalPages = Math.max(1, Math.ceil(payments.length / PAYMENT_TABLE_PAGE_SIZE));
  const paginatedPayments = useMemo(() => {
    const start = (paymentPage - 1) * PAYMENT_TABLE_PAGE_SIZE;
    return payments.slice(start, start + PAYMENT_TABLE_PAGE_SIZE);
  }, [paymentPage, payments]);

  useEffect(() => {
    setPaymentPage((page) => Math.min(page, paymentTotalPages));
  }, [paymentTotalPages]);

  const pendingDowngrade = isPro && profile?.pending_plan_name === 'Basic' && profile?.plan_change_at
    ? { effectiveDate: String(profile.plan_change_at).slice(0, 10) }
    : null;

  const pendingCancellation = isPro && profile?.cancel_at
    ? { effectiveDate: String(profile.cancel_at).slice(0, 10) }
    : null;

  const goToPricing = () => {
    closePage?.();
    setTimeout(() => {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 320);
  };

  const handleCancelSubscription = async (confirmationText) => {
    setCancelPending(true);
    setCancelError('');
    try {
      await api.post('/payments/cancel-subscription', { confirmation: confirmationText });
      setShowCancelModal(false);
      onProfileRefresh?.();
    } catch (err) {
      setCancelError(err.response?.data?.detail || '구독 해지 처리 중 오류가 발생했습니다.');
    } finally {
      setCancelPending(false);
    }
  };

  const handleResumeSubscription = async () => {
    setCancelPending(true);
    setCancelError('');
    try {
      await api.post('/payments/cancel-scheduled-cancellation');
      onProfileRefresh?.();
    } catch (err) {
      setCancelError(err.response?.data?.detail || '재구독 처리 중 오류가 발생했습니다.');
    } finally {
      setCancelPending(false);
    }
  };

  return (
    <>
      <h2 className="pg-h2 mp-billing-title" style={{ marginBottom: 20 }}>
        결제 내역
      </h2>

      <div className="pg-card" style={{ maxWidth: 720, marginBottom: 20 }}>
        {hasPlan ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {/* 왼쪽 */}
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                현재 구독 중
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    fontFamily: 'var(--disp)',
                    color: 'var(--ink)',
                  }}
                >
                  {profile.plan_name} 플랜
                </span>
              </div>

              {isPro && (
                <>
                  {/* 상태 배지 */}
                  {pendingCancellation ? (
                    <div style={{ marginTop: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 20,
                          background: 'rgba(216,73,47,.15)',
                          color: 'var(--bad)',
                        }}
                      >
                        해지 예정
                      </span>
                    </div>
                  ) : (
                    pendingDowngrade && (
                      <div style={{ marginTop: 8, marginBottom: 6 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: 20,
                            background: 'var(--peach)',
                            color: 'var(--orange-2)',
                          }}
                        >
                          {pendingDowngrade.effectiveDate}부터 Basic 전환 예정
                        </span>
                      </div>
                    )
                  )}

                  {/* 안내 / 최근 결제일 */}
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--ink-soft)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    {pendingCancellation ? (
                      <>
                        {pendingCancellation.effectiveDate}까지 Pro 요금제를
                        이용하실 수 있으며, 이후 자동으로 해지됩니다.
                      </>
                    ) : latestPayment ? (
                      <>
                        최근 결제일: <strong>{latestPayment.date}</strong>
                        <PayBadge
                          provider={latestPayment.provider}
                          fallback={latestPayment.method}
                        />
                      </>
                    ) : (
                      '결제 내역을 확인하는 중입니다.'
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 오른쪽 버튼 */}
            <div style={{ display: 'flex', gap: 8 }}>
              {!pendingCancellation && (
                <button
                  className="pg-btn"
                  style={{ fontSize: 13, padding: '9px 16px' }}
                  onClick={goToPricing}
                >
                  요금제 변경
                </button>
              )}

              {isPro &&
                (pendingCancellation ? (
                  <button
                    className="pg-btn"
                    style={{ fontSize: 13, padding: '9px 16px' }}
                    onClick={handleResumeSubscription}
                    disabled={cancelPending}
                  >
                    {cancelPending ? '처리 중...' : '재구독'}
                  </button>
                ) : (
                  <button
                    className="pg-btn danger"
                    style={{ fontSize: 13, padding: '9px 16px' }}
                    onClick={() => setShowCancelModal(true)}
                  >
                    구독 해지
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <strong
              style={{
                display: 'block',
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              구독 중인 요금제가 없습니다
            </strong>

            <p
              style={{
                margin: '0 0 16px',
                fontSize: 13.5,
                color: 'var(--muted)',
              }}
            >
              API Key를 사용하려면 요금제를 다시 선택해주세요.
            </p>

            <button className="pg-btn primary" onClick={goToPricing}>
              요금제 선택하기
            </button>
          </div>
        )}

        {cancelError && (
          <p
            style={{
              color: 'var(--bad)',
              fontSize: 13,
              marginTop: 12,
            }}
          >
            {cancelError}
          </p>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          불러오는 중...
        </div>
      ) : payments.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          결제 내역이 없습니다.
        </div>
      ) : (
        <>
          <table className="pg-table" style={{ maxWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>결제일</th>
                <th style={{ textAlign: 'left' }}>요금제</th>
                <th style={{ textAlign: 'left' }}>결제 금액</th>
                <th style={{ textAlign: 'left' }}>결제 수단</th>
                <th style={{ textAlign: 'left' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPayments.map(row => (
                <tr key={row.payment_id}>
                  <td style={{ textAlign: 'left' }}>{row.date}</td>
                  <td style={{ textAlign: 'left' }}>{row.plan_name}</td>
                  <td style={{ textAlign: 'left' }}>{formatNumber(row.amount)}원</td>
                  <td style={{ textAlign: 'left' }}><PayBadge provider={row.provider} fallback={<span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{row.method}</span>} /></td>
                  <td style={{ textAlign: 'left' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px', borderRadius: 20,
                      fontSize: 12, fontWeight: 600,
                      ...paymentBadgeStyle(row.status),
                    }}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination
            ariaLabel="결제 내역 페이지"
            page={paymentPage}
            totalPages={paymentTotalPages}
            onChange={setPaymentPage}
          />
        </>
      )}

      {showCancelModal && (
        <CancelSubscriptionModal
          onConfirm={handleCancelSubscription}
          onClose={() => setShowCancelModal(false)}
          loading={cancelPending}
          errorMessage={cancelError}
        />
      )}
    </>
  );
}

function ConfirmDeactivateModal({ onConfirm, onClose, isSocialLogin, confirmation, onConfirmationChange, busy }) {
  const canConfirm = !isSocialLogin || confirmation === '탈퇴';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>정말 탈퇴하시겠습니까?</strong>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>이 작업은 되돌릴 수 없습니다.</span>
        </div>
        {isSocialLogin && (
          <div style={{ width: '100%', textAlign: 'left', position: 'relative' }}>
            <input
              id="deactivate-confirmation"
              className="pg-input"
              value={confirmation}
              onChange={e => onConfirmationChange(e.target.value)}
              aria-label="계속하려면 탈퇴를 입력하세요"
              autoFocus
              autoComplete="off"
              onKeyDown={e => {
                if (e.key === 'Enter' && canConfirm && !busy) onConfirm();
              }}
            />
            {!confirmation && (
              <span style={{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
                fontSize: 15,
                pointerEvents: 'none',
              }}>
                계속하려면 <strong>탈퇴</strong>를 입력하세요
              </span>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <button className="pg-btn" style={{ flex: 1, padding: 11 }} onClick={onClose} disabled={busy}>취소</button>
          <button
            className="pg-btn primary"
            style={{ flex: 1, padding: 11, opacity: canConfirm && !busy ? 1 : 0.5, cursor: canConfirm && !busy ? 'pointer' : 'not-allowed' }}
            onClick={onConfirm}
            disabled={!canConfirm || busy}
          >{busy ? '처리 중...' : (isSocialLogin ? '탈퇴' : '확인')}</button>
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f57a65, #c02a12)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={30} height={30}>
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f57a65, #c02a12)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={30} height={30}>
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div className="deactivate-status-icon success">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m6.5 12.5 3.5 3.5 7.5-8" />
          </svg>
        </div>
        <div>
          <strong style={{ display: 'block', fontSize: 16 }}>탈퇴가 완료되었습니다</strong>
        </div>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}

/* ── SC-17 계정 탈퇴 탭 (탈퇴사유 제거) ── */
function DeactivateTab({ closePage, onLogout, profile, user }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [showAgreeWarn, setShowAgreeWarn] = useState(false);
  const [showPwWarn, setShowPwWarn] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState(false);
  const looksSocial = Boolean(user?.is_social_login) || /^(kakao|naver|google)_/.test(user?.user_id || '');
  const isSocialLogin = profile ? Boolean(profile.is_social_login) : looksSocial;

  const confirm_ = () => {
    if (busy) return;
    if (!isSocialLogin && !password.trim()) { setShowPwWarn(true); return; }
    if (!agreed) { setShowAgreeWarn(true); return; }
    setApiError('');
    setConfirmation('');
    setShowConfirm(true);
  };

  const doDeactivate = async () => {
    setBusy(true);
    try {
      const payload = isSocialLogin ? { confirmation } : { password };
      await api.post('/auth/deactivate', payload);
      setShowConfirm(false);
      setShowDone(true);
    } catch (err) {
      setShowConfirm(false);
      setApiError(err.response?.data?.detail || '탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const finishClose = () => {
    setShowDone(false);
    if (onLogout) onLogout();   // 토큰·유저 정보 삭제 후 메인으로
    else closePage();
  };

  const isValid = (isSocialLogin || password.trim()) && agreed;

  return (
    <>
      <h2 className="pg-h2 mp-deactivate-title" style={{ marginBottom: 20 }}>계정 탈퇴</h2>
      <div className="warn-box" style={{ maxWidth: 520, marginBottom: 20 }}>
        <strong>⚠ 탈퇴 시 안내</strong>
        계정 정보, API Key, 결제/사용량 이력이 모두 삭제되며 복구할 수 없습니다.<br/>
        진행 중인 요금제 구독은 즉시 해지됩니다.<br/>
        작성한 게시글/문의 내역은 별도 처리 정책에 따릅니다.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
        {!isSocialLogin && (
          <PasswordInput
            placeholder="비밀번호 확인"
            value={password}
            onChange={e => { setPassword(e.target.value); setApiError(''); }}
            style={apiError ? { border: '1.5px solid #c0392b' } : {}}
          />
        )}
        {apiError && (
          <p style={{ margin: '-6px 0 0', fontSize: 12.5, color: '#c0392b' }}>{apiError}</p>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 17, height: 17, accentColor: '#c0392b' }}/>
          위 내용을 확인했으며 탈퇴에 동의합니다
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="pg-btn" onClick={closePage}>취소</button>
          <button
            className="pg-btn danger"
            onClick={confirm_}
            style={{ opacity: (isValid && !busy) ? 1 : 0.5, cursor: (isValid && !busy) ? 'pointer' : 'not-allowed' }}
          >{busy ? '처리 중...' : '탈퇴하기'}</button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDeactivateModal
          onConfirm={doDeactivate}
          onClose={() => { setShowConfirm(false); setConfirmation(''); }}
          isSocialLogin={isSocialLogin}
          confirmation={confirmation}
          onConfirmationChange={value => { setConfirmation(value); setApiError(''); }}
          busy={busy}
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

/* ── 관리자 전용: 문의 내역 조회 탭 ── */
const INQUIRY_STATUS_LABEL = {
  new: '신규',
  in_progress: '처리중',
  done: '완료',
  spam: '스팸',
};

function InquiryCard({ q, formatDate }) {
  const isEnterprise = q.inquiry_type === 'enterprise';
  return (
    <div className="pg-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {isEnterprise && q.company ? `${q.company} · ${q.contact_name || ''}` : q.email}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(q.created_at)}</span>
      </div>
      {isEnterprise && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {q.email}
          {q.plan_interest ? ` · 예상 호출량: ${q.plan_interest}` : ''}
        </div>
      )}
      {q.message && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap' }}>{q.message}</p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {q.phone && <span style={{ fontSize: 12, color: 'var(--muted)' }}>☎ {q.phone}</span>}
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: 'var(--peach)', color: 'var(--orange-2)',
        }}>
          {INQUIRY_STATUS_LABEL[q.inquiry_status] || q.inquiry_status}
        </span>
      </div>
    </div>
  );
}

function InquirySection({ title, items, formatDate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
        {title} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>접수된 문의가 없습니다.</p>
      ) : (
        items.map((q) => <InquiryCard key={q.inquiry_id} q={q} formatDate={formatDate} />)
      )}
    </div>
  );
}

function InquiriesTab() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const { data } = await api.get('/admin/inquiries');
        if (!ignore) setInquiries(data.inquiries || []);
      } catch (err) {
        if (!ignore) setError(err.response?.data?.detail || '문의 목록을 불러오지 못했습니다.');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const formatDate = (value) => {
    if (!value) return '';
    return String(value).replace('T', ' ').slice(0, 16);
  };

  const generalInquiries = inquiries.filter((q) => q.inquiry_type !== 'enterprise');
  const enterpriseInquiries = inquiries.filter((q) => q.inquiry_type === 'enterprise');

  return (
    <>
      <h2 className="pg-h2" style={{ marginBottom: 20 }}>문의 내역</h2>
      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>불러오는 중...</p>
      ) : error ? (
        <p style={{ color: '#c0392b', fontSize: 14 }}>{error}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <InquirySection title="일반 문의 내역" items={generalInquiries} formatDate={formatDate} />
          <InquirySection title="사용(도입) 문의 내역" items={enterpriseInquiries} formatDate={formatDate} />
        </div>
      )}
    </>
  );
}

const TABS = [
  { id: 'info',       label: '내 정보' },
  { id: 'apikey',     label: 'API Key 관리' },
  { id: 'usage',      label: '사용량 조회' },
  { id: 'billing',    label: '결제 내역' },
  { id: 'deactivate', label: '계정 탈퇴', danger: true },
];

const ADMIN_TAB = { id: 'inquiries', label: '문의 내역' };

export default function MypagePage({ openPage, closePage, initialTab = 'info', user = null, onUserUpdate, onLogout }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [profile, setProfile] = useState(null);
  const isAdmin = user?.role === 'admin';
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const fetchProfile = () => {
    api.get('/auth/me')
      .then(({ data }) => setProfile(data))
      .catch(() => setProfile(null));
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div className="mp-wrap">
    <style>{`
        .mp-wrap .pg-table th,
        .mp-wrap .pg-table td {
          text-align: left !important;
        }
        .mp-wrap .pg-table td[colspan] {
          text-align: center !important;
        }
        .mp-wrap .pg-table th {
          padding-top: 17px;
          padding-bottom: 17px;
          padding-left: 16px;
          padding-right: 16px;
        }
        .mp-wrap .pg-table td {
          padding-top: 15px;
          padding-bottom: 15px;
          padding-left: 16px;
          padding-right: 16px;
        }

        /* 좁은 화면에서는 첫 탭부터 보이도록 가로 탭을 왼쪽 기준으로 배치 */
        @media (max-width: 940px) {
          .mp-wrap .mp-sidebar {
            justify-content: center;
          }
        }
      `}</style>
      <div className="mp-sidebar">
        {tabs.map(t => (
          <button key={t.id}
          className={`mp-nav-item${activeTab === t.id ? ' active' : ''}${t.danger ? ' danger' : ''}`}
          onClick={() => setActiveTab(t.id)}>
          {t.label}
        </button>
        ))}
      </div>
      <div className="mp-content">
        {activeTab === 'info'       && <InfoTab user={user} onUserUpdate={onUserUpdate} profile={profile} />}
        {activeTab === 'apikey'     && <ApiKeyTab openPage={openPage} closePage={closePage} profile={profile} />}
        {activeTab === 'usage'      && <UsageTab />}
        {activeTab === 'billing'    && <BillingTab closePage={closePage} profile={profile} onProfileRefresh={fetchProfile} />}
        {activeTab === 'deactivate' && (
          <DeactivateTab
            closePage={closePage}
            onLogout={onLogout}
            profile={profile}
            user={user}
          />
        )}
        {activeTab === 'inquiries' && isAdmin && <InquiriesTab />}
      </div>
    </div>
  );
}

function ReissueDoneModal({ onClose, target }) {
  const message = target === 'secret'
    ? '새 Secret Key가 발급되었습니다.'
    : target === 'site'
      ? '새 Site Key가 발급되었습니다.'
      : '새 Site Key와 Secret Key가 발급되었습니다.';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 320, boxShadow: 'var(--shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gold), var(--orange-2))', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22} aria-hidden="true">
            <path d="M5 12.5 9.5 17 19 7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <strong style={{ fontSize: 16 }}>{message}</strong>
        <button className="pg-btn primary" style={{ width: '100%', padding: 11 }} onClick={onClose}>확인</button>
      </div>
    </div>
  );
}