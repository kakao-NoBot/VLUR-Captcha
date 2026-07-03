import React, { useEffect, useRef, useState } from 'react';

// ~~@~~.~~ 형식 (도메인 TLD 제한 없음)
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DOMAIN_OPTIONS = [
  { value: 'gmail.com',    label: 'gmail.com' },
  { value: 'naver.com',   label: 'naver.com' },
  { value: 'daum.net',    label: 'daum.net' },
  { value: 'kakao.com',   label: 'kakao.com' },
  { value: 'hanmail.net', label: 'hanmail.net' },
  { value: 'outlook.com', label: 'outlook.com' },
  { value: 'custom',      label: '직접 입력' },
];

export default function EmailInput({ onChange, error, initialEmail = '', ...inputProps }) {
  const [value, setValue] = useState(initialEmail);
  const [blurred, setBlurred] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDomain, setActiveDomain] = useState('custom');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { onChange?.(value); }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleDomainSelect = (domain) => {
    const local = value.includes('@') ? value.split('@')[0] : value;
    setActiveDomain(domain);
    if (domain === 'custom') {
      setValue(`${local}@`);
      setMenuOpen(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setValue(`${local}@${domain}`);
      setMenuOpen(false);
    }
  };

  const showFormatWarn =
    blurred && !menuOpen && value.trim() !== '' && !EMAIL_RE.test(value.trim());

  return (
    <div ref={wrapRef}>
      <div style={{ position: 'relative' }}>
      <input
        className="pg-input"
        type="text"
        inputMode="email"
        placeholder="example@domain.com"
        ref={inputRef}
        {...inputProps}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={e => { setBlurred(true); inputProps.onBlur?.(e); }}
        style={{
          width: '100%',
          paddingRight: 42,
          ...(error || showFormatWarn ? { border: '1.5px solid #c0392b' } : {}),
        }}
      />
      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        aria-label="이메일 도메인 선택"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: 'var(--orange)', display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
            boxShadow: '0 16px 38px -18px rgba(55,38,25,.34)',
            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}
        >
          {DOMAIN_OPTIONS.map((opt) => {
            const isActive = activeDomain === opt.value;
            return (
              <React.Fragment key={opt.value}>
                {opt.value === 'custom' && (
                  <div style={{ borderTop: '1px solid var(--line-soft)', margin: '4px 0' }} />
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleDomainSelect(opt.value)}
                  style={{
                    textAlign: 'left', border: 'none', borderRadius: 8,
                    padding: '10px 12px', fontSize: 14, fontFamily: 'var(--body)',
                    cursor: 'pointer',
                    background: isActive ? 'var(--peach)' : 'transparent',
                    color: isActive || opt.value === 'custom' ? 'var(--orange-2)' : 'var(--ink-soft)',
                    fontWeight: isActive || opt.value === 'custom' ? 600 : 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--peach)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>{opt.value === 'custom' ? opt.label : `@${opt.label}`}</span>
                  {isActive && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
      </div>
      {(error || showFormatWarn) && (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#c0392b' }}>올바른 이메일 주소를 입력해 주세요.</p>
      )}
    </div>
  );
}
