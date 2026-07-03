import React, { useEffect, useRef, useState } from 'react';

// EmailInput의 도메인 드롭다운과 동일한 디자인 언어의 커스텀 셀렉트
export default function SelectInput({ options, value, onChange, placeholder = '선택' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="pg-input"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          width: '100%', textAlign: 'left', cursor: 'pointer',
          color: value ? 'var(--ink)' : 'var(--muted)',
        }}
      >
        <span>{value || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--orange)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
            boxShadow: '0 16px 38px -18px rgba(55,38,25,.34)',
            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {options.map((opt) => {
            const isActive = value === opt;
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  textAlign: 'left', border: 'none', borderRadius: 8,
                  padding: '10px 12px', fontSize: 14, fontFamily: 'var(--body)',
                  cursor: 'pointer',
                  background: isActive ? 'var(--peach)' : 'transparent',
                  color: isActive ? 'var(--orange-2)' : 'var(--ink-soft)',
                  fontWeight: isActive ? 600 : 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--peach)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{opt}</span>
                {isActive && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
