// pages/EnterprisePage.jsx

import React, { useState } from 'react';
import EmailInput from '../components/EmailInput';
import SelectInput from '../components/SelectInput';
import api from '../api/axios';

const VOLUMES = ['월 50만 건 이하', '월 50~200만 건', '월 200~500만 건', '월 500만 건 이상', '미정'];

function AlertModal({ message, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(36,27,21,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--card)', borderRadius: 'var(--r)', padding: '28px 26px',
        width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-md)',
        textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'var(--peach)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--orange-2)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01"/>
            <circle cx="12" cy="12" r="9"/>
          </svg>
        </div>
        <p style={{ margin: '0 0 20px', fontSize: 14.5, color: 'var(--ink)', lineHeight: 1.6 }}>{message}</p>
        <button
          className="pg-btn primary"
          style={{ width: '100%', padding: 12, fontSize: 14 }}
          onClick={onClose}
        >
          확인
        </button>
      </div>
    </div>
  );
}

export default function EnterprisePage({ closePage }) {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ company: '', name: '', email: '', phone: '', volume: '', message: '' });
  const [attempted, setAttempted] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const errorStyle = { border: '1.5px solid #c0392b' };

  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const handleSubmit = async () => {
    if (!form.company || !form.name || !form.email) {
      setAttempted(true);
      setAlertMsg('회사명, 담당자명, 이메일은 필수입니다.');
      return;
    }
    if (!isEmailFormatValid) {
      setAttempted(true);
      setAlertMsg('올바른 이메일 형식으로 입력해주세요.');
      return;
    }
    if (!form.volume) {
    setAttempted(true);
    setAlertMsg('예상 월 호출량을 선택해주세요.');
    return;
  }
  if (!form.message.trim()) {
    setAttempted(true);
    setAlertMsg('도입 목적 및 문의 내용을 입력해주세요.');
    return;
  }
    setSubmitting(true);
    try {
      await api.post('/contact', {
        inquiry_type: 'enterprise',
        company: form.company.trim(),
        contact_name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        plan_interest: form.volume || null,
        message: form.message.trim() || null,
      });
      setSubmitted(true);
    } catch (err) {
      setAlertMsg(err.response?.data?.detail || '문의 제출 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="po-body" style={{ maxWidth: 560, textAlign: 'center', paddingTop: 60 }}>
        <div className="deactivate-status-icon success" style={{ margin: '0 auto 24px' }}>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m6.5 12.5 3.5 3.5 7.5-8" />
          </svg>
        </div>
        <h2 className="pg-h1" style={{ marginBottom: 12 }}>문의가 접수되었습니다!</h2>
        <p className="pg-sub" style={{ maxWidth: 380, margin: '0 auto', wordBreak: 'keep-all' }}>
          담당자가 영업일 기준 1~2일 내로<br /><strong>{form.email}</strong> 로 연락드리겠습니다.
        </p>
        <button className="pg-btn primary" style={{ marginTop: 20, padding: '12px 32px' }} onClick={closePage}>홈으로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="po-body" style={{ maxWidth: 600 }}>
      <div className="pg-eyebrow">Enterprise · 도입 문의</div>
      <h1 className="pg-h1">서비스 도입 문의</h1>
      <p className="pg-sub">아래 양식을 작성해 주시면 담당자가 맞춤 견적과 함께 연락드립니다.</p>

      <div className="pg-card" style={{ marginBottom: 16 }}>
        <div className="pg-label">기업 정보</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="pg-input"
            placeholder="회사명 / 서비스명 *"
            value={form.company}
            onChange={set('company')}
            style={attempted && !form.company ? errorStyle : {}}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              className="pg-input"
              placeholder="담당자명 *"
              value={form.name}
              onChange={set('name')}
              style={attempted && !form.name ? errorStyle : {}}
            />
            <input className="pg-input" placeholder="전화번호 (선택)" value={form.phone} onChange={set('phone')} />
          </div>
          <EmailInput
            onChange={val => setForm(f => ({ ...f, email: val }))}
            error={attempted && !isEmailFormatValid}
          />
        </div>
      </div>

      <div className="pg-card" style={{ marginBottom: 16 }}>
        <div className="pg-label">도입 정보</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SelectInput
            options={VOLUMES}
            value={form.volume}
            onChange={val => setForm(f => ({ ...f, volume: val }))}
            placeholder="예상 월 호출량 선택"
          />
          <textarea
            className="pg-input"
            placeholder="도입 목적 및 문의 내용을 자유롭게 작성해 주세요. *"
            value={form.message}
            onChange={set('message')}
            rows={5}
            style={{ resize: 'vertical', lineHeight: 1.6, ...(attempted && !form.message.trim() ? errorStyle : {}) }}
          />
        </div>
      </div>

      <div style={{ background: 'var(--peach)', border: '1px solid var(--peach-deep)', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: 'var(--ink-soft)', marginBottom: 20 }}>
        ✓ SLA 99.9% 보장 &nbsp;·&nbsp; ✓ API Key 무제한 &nbsp;·&nbsp; ✓ 전담 매니저 &nbsp;·&nbsp; ✓ 온프레미스 배포 가능
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="pg-btn" onClick={closePage}>취소</button>
        <button className="pg-btn primary" style={{ flex: 1, padding: 14, fontSize: 15, opacity: submitting ? 0.7 : 1 }} onClick={handleSubmit} disabled={submitting}>
          {submitting ? '제출 중...' : '문의 제출하기'}
        </button>
      </div>

      {alertMsg && (
        <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      )}
    </div>
  );
}
