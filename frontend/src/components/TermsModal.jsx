import React, { useEffect, useRef } from 'react';
import termsText from '../assets/VLUR_CAPTCHA_이용약관.md?raw';

function InlineText({ children }) {
  const parts = String(children).split(/(\*\*[^*]+\*\*)/g);

  const renderWithBreaks = (text, keyPrefix) => text.split('<br>').map((segment, index) => (
    index === 0
      ? <React.Fragment key={`${keyPrefix}-${index}`}>{segment}</React.Fragment>
      : <span className="terms-forced-break" key={`${keyPrefix}-${index}`}>{segment}</span>
  ));

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{renderWithBreaks(part.slice(2, -2), `strong-${index}`)}</strong>;
    }
    return <React.Fragment key={`${part}-${index}`}>{renderWithBreaks(part, `text-${index}`)}</React.Fragment>;
  });
}

function TermsContent() {
  return termsText.split('\n').map((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return <div className="terms-spacer" key={`space-${index}`} />;
    if (line === '---') return <hr key={`rule-${index}`} />;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) return null;
      const Heading = level === 2 ? 'h2' : 'h3';
      return <Heading key={`heading-${index}`}><InlineText>{heading[2]}</InlineText></Heading>;
    }

    if (line.startsWith('>')) {
      return <p className="terms-meta" key={`meta-${index}`}><InlineText>{line.replace(/^>\s?/, '')}</InlineText></p>;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      return <p className="terms-bullet" key={`bullet-${index}`}><InlineText>{bullet[1]}</InlineText></p>;
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      return (
        <p className="terms-numbered" key={`numbered-${index}`}>
          <span>{numbered[1]}.</span>
          <InlineText>{numbered[2]}</InlineText>
        </p>
      );
    }

    return <p key={`paragraph-${index}`}><InlineText>{line}</InlineText></p>;
  });
}

export default function TermsModal({ open, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="terms-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="terms-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="terms-modal-header">
          <div>
            <p>VLUR CAPTCHA</p>
            <h2 id="terms-modal-title">이용약관</h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="이용약관 닫기">×</button>
        </div>

        <div className="terms-modal-content">
          <TermsContent />
        </div>

        <div className="terms-modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </section>
    </div>
  );
}
