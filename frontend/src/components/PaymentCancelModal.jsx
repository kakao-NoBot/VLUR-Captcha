import React, { useEffect } from 'react';

export default function PaymentCancelModal({ open, message, onClose }) {
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

  if (!open) return null;

  return (
    <div className="terms-modal-backdrop payment-cancel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="terms-modal payment-cancel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-cancel-title"
        aria-describedby="payment-cancel-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="payment-cancel-content">
          <div className="payment-cancel-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M10 10 22 22M22 10 10 22" />
            </svg>
          </div>
          <h2 id="payment-cancel-title">결제 취소</h2>
          <p id="payment-cancel-description">
            {message || '결제를 취소하였습니다.'}<br />다시 결제 수단을 선택해 주세요.
          </p>
        </div>
        <div className="terms-modal-footer payment-cancel-footer">
          <button type="button" className="payment-cancel-retry" onClick={onClose}>
            확인
          </button>
        </div>
      </section>
    </div>
  );
}
