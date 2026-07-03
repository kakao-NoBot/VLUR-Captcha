// MypagePage.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import GuideStepModal from '../components/GuideStepModal';
import PasswordInput from '../components/PasswordInput';
import EmailInput from '../components/EmailInput';
import ClearableInput from '../components/ClearableInput';
import api from '../api/axios';

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
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>영문·숫자·특수문자 포함 8자 이상</p>
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
  const [finalEmail, setFinalEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [attempted, setAttempted] = useState(false);

  const errorStyle = { border: '1.5px solid #c0392b' };
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail);
  const isValid = name.trim() && isEmailValid && phone.trim();

  const handleSave = () => {
    if (!isValid) { setAttempted(true); return; }
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

          <EmailInput
            onChange={setFinalEmail}
            error={attempted && !isEmailValid}
            initialEmail={user?.email || ''}
          />

          <ClearableInput
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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

/* ── SC-10 결제 내역 탭 ── */
const PAYMENT_HISTORY = [
  { id: 'PAY-2026060001', date: '2026-06-01', plan: 'Pro',     amount: 49000, method: '신한카드 ****1234', status: '완료' },
  { id: 'PAY-2026050001', date: '2026-05-01', plan: 'Pro',     amount: 49000, method: '신한카드 ****1234', status: '완료' },
  { id: 'PAY-2026040001', date: '2026-04-01', plan: 'Pro',     amount: 49000, method: '신한카드 ****1234', status: '완료' },
  { id: 'PAY-2026030001', date: '2026-03-01', plan: 'Starter', amount: 19000, method: '신한카드 ****1234', status: '완료' },
  { id: 'PAY-2026020001', date: '2026-02-01', plan: 'Starter', amount: 19000, method: '신한카드 ****1234', status: '완료' },
  { id: 'PAY-2026010001', date: '2026-01-01', plan: 'Starter', amount: 19000, method: '신한카드 ****1234', status: '완료' },
];

const STATUS_STYLE = {
  '완료':   { background: 'rgba(46,158,107,.15)', color: 'var(--ok)' },
  '환불':   { background: 'rgba(216,73,47,.15)', color: 'var(--bad)' },
  '실패':   { background: 'rgba(216,73,47,.15)', color: 'var(--bad)' },
  '대기':   { background: 'var(--peach)', color: 'var(--orange-2)' },
};

function CancelSubModal({ onConfirm, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
        width: '100%', maxWidth: 340, boxShadow: 'var(--shadow-md)',
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
          <strong style={{ display: 'block', fontSize: 16, marginBottom: 6 }}>구독을 해지하시겠어요?</strong>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            해지해도 <strong>2026-07-01</strong>까지는<br/>Pro 플랜을 계속 이용할 수 있습니다.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
          <button className="pg-btn" style={{ flex: 1, padding: 11 }} onClick={onClose}>취소</button>
          <button className="pg-btn danger" style={{ flex: 1, padding: 11 }} onClick={onConfirm}>해지하기</button>
        </div>
      </div>
    </div>
  );
}

function BillingTab({ closePage }) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const goToPricing = () => {
    closePage?.();
    setTimeout(() => {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 320);
  };

  const handleCancel = () => {
    setCancelled(true);
    setShowCancelModal(false);
  };

  return (
    <>
      <h2 className="pg-h2" style={{ marginBottom: 20 }}>결제 내역</h2>

      {/* 현재 구독 요약 */}
      <div className="pg-card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>현재 구독 중</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--disp)', color: 'var(--ink)' }}>Pro 플랜</span>
              {cancelled && (
                <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(216,73,47,.15)', color: 'var(--bad)' }}>
                  해지 예정
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>
              {cancelled
                ? <><strong>2026-07-01</strong>까지 이용 가능 · 이후 자동 해지</>
                : <>다음 결제일: <strong>2026-07-01</strong> · 신한카드 ****1234</>
              }
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!cancelled && (
              <button className="pg-btn" style={{ fontSize: 13, padding: '9px 16px' }} onClick={goToPricing}>
                요금제 변경
              </button>
            )}
            {!cancelled ? (
              <button className="pg-btn danger" style={{ fontSize: 13, padding: '9px 16px' }} onClick={() => setShowCancelModal(true)}>
                구독 해지
              </button>
            ) : (
              <button className="pg-btn" style={{ fontSize: 13, padding: '9px 16px' }} onClick={goToPricing}>
                재구독
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 결제 내역 테이블 */}
      {PAYMENT_HISTORY.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          결제 내역이 없습니다.
        </div>
      ) : (
        <table className="pg-table" style={{ maxWidth: 720 }}>
          <thead>
            <tr>
              <th>결제일</th>
              <th>요금제</th>
              <th>결제 금액</th>
              <th>결제 수단</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {PAYMENT_HISTORY.map(row => (
              <tr key={row.id}>
                <td>{row.date}</td>
                <td>{row.plan}</td>
                <td>{formatNumber(row.amount)}원</td>
                <td style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{row.method}</td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px', borderRadius: 20,
                    fontSize: 12, fontWeight: 600,
                    ...(STATUS_STYLE[row.status] || {}),
                  }}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCancelModal && (
        <CancelSubModal
          onConfirm={handleCancel}
          onClose={() => setShowCancelModal(false)}
        />
      )}
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 24px',
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
        <PasswordInput
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

export default function MypagePage({ openPage, closePage, initialTab = 'info', user = null }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const isAdmin = user?.role === 'admin';
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="mp-wrap">
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
        {activeTab === 'info'       && <InfoTab user={user} />}
        {activeTab === 'apikey'     && <ApiKeyTab openPage={openPage} />}
        {activeTab === 'usage'      && <UsageTab />}
        {activeTab === 'billing'    && <BillingTab closePage={closePage} />}
        {activeTab === 'deactivate' && <DeactivateTab closePage={closePage} />}
        {activeTab === 'inquiries' && isAdmin && <InquiriesTab />}
      </div>
    </div>
  );
}
