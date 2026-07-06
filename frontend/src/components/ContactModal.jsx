import React, { useEffect, useRef, useState } from 'react';
import EmailInput from './EmailInput';
import api from '../api/axios';

const CONTACT_EMAIL = 'vlur@vlur.site';
const GENERAL_INQUIRY_TYPES = [
  '사용 문의',
  '계정 문의',
  'API Key 문의',
  '결제/요금제 문의',
  '기술 문의',
  '오류 신고',
  '기타',
];

export default function ContactModal({ open, onClose }) {
  const [requester, setRequester] = useState('');
  const [email, setEmail] = useState('');
  const [inquiryCategory, setInquiryCategory] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const requesterInputRef = useRef(null);
  const inquiryTypeRef = useRef(null);
  const messageInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setRequester('');
      setEmail('');
      setInquiryCategory('');
      setMessage('');
      setSent(false);
      setValidationError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedRequester = requester.trim();
    const trimmedEmail = email.trim();
    const trimmedInquiryCategory = inquiryCategory.trim();
    const trimmedMessage = message.trim();

    if (!trimmedRequester) {
      setValidationError({ field: 'requester', message: '이름을 입력해 주세요.' });
      requesterInputRef.current?.focus();
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setValidationError({ field: 'email', message: '올바른 이메일 주소를 입력해 주세요.' });
      return;
    }

    if (!trimmedInquiryCategory) {
      setValidationError({ field: 'inquiryType', message: '문의 유형을 선택해 주세요.' });
      inquiryTypeRef.current?.focus();
      return;
    }

    if (!trimmedMessage) {
      setValidationError({ field: 'message', message: '문의 내용을 입력해 주세요.' });
      messageInputRef.current?.focus();
      return;
    }

    setValidationError(null);
    setSubmitting(true);
    try {
      await api.post('/contact', {
        email: trimmedEmail,
        message: trimmedMessage,
        inquiry_type: 'general',
        contact_name: trimmedRequester,
        plan_interest: trimmedInquiryCategory,
      });
      setSent(true);
    } catch (err) {
      setValidationError({
        field: 'message',
        message: err.response?.data?.detail || '문의 전송 중 오류가 발생했습니다.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderValidationAlert = (field) => {
    if (validationError?.field !== field) return null;

    return (
      <div className="contact-field-alert" id={`contact-${field}-error`} role="alert">
        <span className="contact-field-alert-icon" aria-hidden="true">!</span>
        <span>{validationError.message}</span>
      </div>
    );
  };

  return (
    <div className="terms-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="terms-modal contact-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="terms-modal-header">
          <div>
            <p>VLUR CAPTCHA</p>
            <h2 id="contact-modal-title">문의하기</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="문의하기 닫기">×</button>
        </div>

        {sent ? (
          <>
            <div className="contact-modal-success">
              <div className="contact-success-icon" aria-hidden="true">
                <svg viewBox="0 0 34 34" fill="none">
                  <path d="M7 17.5 13.5 24 27 10" />
                </svg>
              </div>
              <strong>문의가 전송되었습니다.</strong>
              <p><b>{CONTACT_EMAIL}</b>로 문의 내용이 전송되었습니다.</p>
            </div>
            <div className="terms-modal-footer">
              <button type="button" className="btn btn-primary" onClick={onClose}>확인</button>
            </div>
          </>
        ) : (
          <form className="contact-modal-form" onSubmit={handleSubmit} noValidate>
            <div className="contact-modal-content">
              <p className="contact-modal-guide">문의 내용을 남겨주시면 확인 후 입력하신 이메일로 답변드리겠습니다.</p>

              <label className={validationError?.field === 'requester' ? 'has-error' : ''}>
                <span>이름</span>
                <input
                  ref={requesterInputRef}
                  value={requester}
                  placeholder="이름을 입력해 주세요."
                  aria-invalid={validationError?.field === 'requester'}
                  aria-describedby={validationError?.field === 'requester' ? 'contact-requester-error' : undefined}
                  onChange={(event) => {
                    setRequester(event.target.value);
                    if (validationError?.field === 'requester') setValidationError(null);
                  }}
                />
                {renderValidationAlert('requester')}
              </label>

              <label className={validationError?.field === 'email' ? 'has-error' : ''}>
                <span>회신 이메일</span>
                <EmailInput
                  onChange={(val) => { setEmail(val); if (validationError?.field === 'email') setValidationError(null); }}
                  error={validationError?.field === 'email'}
                />
                {renderValidationAlert('email')}
              </label>

              <label className={validationError?.field === 'inquiryType' ? 'has-error' : ''}>
                <span>문의 유형</span>
                <select
                  ref={inquiryTypeRef}
                  value={inquiryCategory}
                  aria-invalid={validationError?.field === 'inquiryType'}
                  aria-describedby={validationError?.field === 'inquiryType' ? 'contact-inquiryType-error' : undefined}
                  onChange={(event) => {
                    setInquiryCategory(event.target.value);
                    if (validationError?.field === 'inquiryType') setValidationError(null);
                  }}
                >
                  <option value="">문의 유형을 선택해 주세요.</option>
                  {GENERAL_INQUIRY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                {renderValidationAlert('inquiryType')}
              </label>

              <label className={validationError?.field === 'message' ? 'has-error' : ''}>
                <span>문의 내용</span>
                <div className="contact-textarea-wrap">
                  <textarea
                    ref={messageInputRef}
                    value={message}
                    maxLength={2000}
                    placeholder="문의하실 내용을 입력해 주세요."
                    aria-invalid={validationError?.field === 'message'}
                    aria-describedby={validationError?.field === 'message' ? 'contact-message-error' : undefined}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      if (validationError?.field === 'message') setValidationError(null);
                    }}
                  />
                  <small>{message.length}/2000</small>
                </div>
                {renderValidationAlert('message')}
              </label>
            </div>

            <div className="terms-modal-footer">
              <button type="button" className="btn btn-outline" onClick={onClose}>취소</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '전송 중...' : '전송'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
