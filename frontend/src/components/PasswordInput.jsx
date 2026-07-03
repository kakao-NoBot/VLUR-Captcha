// PasswordInput.jsx

import React, { useState } from 'react';

const EyeOpen = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOff = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function PasswordInput({ className = 'pg-input', style, value, onChange, ...props }) {
  const cls = className.includes('pg-input') ? className : `pg-input ${className}`;
  const [show, setShow] = useState(false);

  const handleClear = () => onChange?.({ target: { value: '' } });

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...props}
        value={value}
        onChange={onChange}
        className={cls}
        type={show ? 'text' : 'password'}
        style={{ width: '100%', paddingRight: value ? 72 : 42, ...style }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        aria-label={show ? '비밀번호 숨기기' : '비밀번호 보기'}
        style={{
          position: 'absolute', right: value ? 36 : 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--muted)', display: 'flex', alignItems: 'center',
          transition: 'right .15s',
        }}
      >
        {show ? <EyeOpen /> : <EyeOff />}
      </button>
      {value && (
        <button
          type="button"
          tabIndex={-1}
          onClick={handleClear}
          aria-label="입력 내용 지우기"
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
