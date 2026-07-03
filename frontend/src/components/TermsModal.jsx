import React, { useEffect, useRef } from 'react';
import termsText from '../assets/VLUR_CAPTCHA_이용약관.md?raw';

function normalizeTermsBody(lines) {
  return lines
    .join('\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseTermsDocument(rawText) {
  const introLines = [];
  const sections = [];
  let currentSection = null;

  rawText.split('\n').forEach((rawLine) => {
    if (/^#\s+/.test(rawLine)) return;

    const sectionHeading = rawLine.match(/^##\s+(.+)$/);
    if (sectionHeading) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: sectionHeading[1], lines: [] };
      return;
    }

    if (currentSection) currentSection.lines.push(rawLine);
    else introLines.push(rawLine);
  });

  if (currentSection) sections.push(currentSection);

  return {
    intro: normalizeTermsBody(introLines),
    sections: sections.map(({ title, lines }) => ({
      title,
      body: normalizeTermsBody(lines),
    })),
  };
}

const TERMS_DOCUMENT = parseTermsDocument(termsText);

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
          {TERMS_DOCUMENT.intro && (
            <p className="terms-intro">{TERMS_DOCUMENT.intro}</p>
          )}
          {TERMS_DOCUMENT.sections.map((section, index) => (
            <section className="terms-section" key={`${section.title}-${index}`}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>

        <div className="terms-modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>확인</button>
        </div>
      </section>
    </div>
  );
}
