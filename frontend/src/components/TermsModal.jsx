import React, { useEffect, useRef } from 'react';
import termsText from '../assets/VLUR_CAPTCHA_이용약관.md?raw';

const S = {
  meta: {
    fontSize: 13, color: 'var(--muted)', lineHeight: 1.7,
    margin: '0 0 4px', fontStyle: 'italic',
  },
  intro: {
    fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.8,
    margin: '0 0 8px',
  },
  h2: {
    fontSize: 14, fontWeight: 700, color: 'var(--ink)',
    margin: '24px 0 10px', letterSpacing: '-.01em',
    paddingBottom: 8, borderBottom: '1px solid var(--line-soft)',
  },
  h3: {
    fontSize: 13.5, fontWeight: 700, color: 'var(--ink)',
    margin: '14px 0 6px',
  },
  bullet: {
    fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.75,
    margin: '0 0 4px', paddingLeft: 16,
    display: 'flex', gap: 6,
  },
  numbered: {
    fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.75,
    margin: '0 0 4px', paddingLeft: 4,
    display: 'flex', gap: 8,
  },
  p: {
    fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.8,
    margin: '0 0 6px',
  },
  hr: {
    border: 'none', borderTop: '1px solid var(--line)',
    margin: '20px 0',
  },
};

function Inline({ children }) {
  const parts = String(children).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part.replace(/<br>/g, '')}</React.Fragment>
  );
}

function TermsContent() {
  return termsText.split('\n').map((raw, i) => {
    const line = raw.trim();
    if (!line) return <div key={i} style={{ height: 6 }} />;
    if (line === '---') return <hr key={i} style={S.hr} />;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) return null;
      return <p key={i} style={level === 2 ? S.h2 : S.h3}><Inline>{heading[2]}</Inline></p>;
    }

    if (line.startsWith('>')) {
      return <p key={i} style={S.meta}><Inline>{line.replace(/^>\s?/, '')}</Inline></p>;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      return (
        <div key={i} style={S.bullet}>
          <span style={{ flexShrink: 0, color: 'var(--orange)' }}>•</span>
          <span><Inline>{bullet[1]}</Inline></span>
        </div>
      );
    }

    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      return (
        <div key={i} style={S.numbered}>
          <span style={{ flexShrink: 0, color: 'var(--orange)', fontWeight: 600 }}>{numbered[1]}.</span>
          <span><Inline>{numbered[2]}</Inline></span>
        </div>
      );
    }

    return <p key={i} style={S.intro}><Inline>{line}</Inline></p>;
  });
}

export default function TermsModal({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,.25)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px', borderBottom: '1px solid var(--line-soft)', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 4px' }}>VLUR CAPTCHA</p>
            <h2 id="terms-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: 'var(--disp)', letterSpacing: '-.01em' }}>이용약관</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="이용약관 닫기"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              width: 32, height: 32, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 20, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '24px 28px', flex: 1 }}>
          <TermsContent />
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid var(--line-soft)',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button type="button" className="btn btn-primary" onClick={onClose}
            style={{ fontSize: 14, padding: '9px 22px' }}>확인</button>
        </div>
      </section>
    </div>
  );
}
