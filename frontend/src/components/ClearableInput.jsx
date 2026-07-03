// ClearableInput.jsx

import React from 'react';

export default function ClearableInput({ value, onChange, className = 'pg-input', style, containerStyle, ...props }) {
  return (
    <div style={{ position: 'relative', ...containerStyle }}>
      <input
        {...props}
        className={className}
        value={value}
        onChange={onChange}
        style={{ width: '100%', paddingRight: value ? 36 : 16, ...style }}
      />
      {value && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onChange({ target: { value: '' } })}
          aria-label="입력 내용 지우기"
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: 'var(--muted)', display: 'flex', alignItems: 'center',
            borderRadius: '50%',
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
