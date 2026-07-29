// CaptchaDemo.jsx
// vlur.site "지금 체험하기" 마케팅 데모 전용 chrome(컬러피커 · 유형1/2 탭)만 여기 있다.
// 실제 캡차 게임 UI(드래그·경유지점·성공/실패 화면)는 widget/CaptchaWidgetCore.jsx가 정본이며,
// 이 파일은 그걸 그대로 가져다 쓴다 — 게임 UI를 고칠 땐 그 파일만 고치면 이 데모와 임베드
// 스크립트(widget/main.jsx) 양쪽에 함께 반영된다.

import React, { useState, useRef, useEffect } from 'react';
import { DragCaptcha, MatchDragCaptcha } from '../widget/CaptchaWidgetCore';
import {
  CAPTCHA_THEME_PRESETS,
  hexToHsv,
  hsvToHex,
  mixHexColors,
  normalizeHexColor,
  resolveCaptchaTheme,
} from '../utils/captchaTheme';

const DEMO_SITE_KEY = import.meta.env.VITE_VLUR_SITE_KEY;

function currentThemeMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function buildDemoPalette(theme) {
  const resolved = resolveCaptchaTheme(theme);
  const accentHsv = hexToHsv(resolved.accent);
  const safeAccent = accentHsv.v < 50 ? hsvToHex({ ...accentHsv, v: 50 }) : resolved.accent;
  return {
    ...resolved,
    accent: safeAccent,
    accentDeep: mixHexColors(safeAccent, '#000000', 0.18),
    highlight: mixHexColors(safeAccent, '#FFFFFF', 0.25),
    softDeep: mixHexColors(safeAccent, '#FFFFFF', 0.78),
    line: mixHexColors(safeAccent, '#FFFFFF', 0.72),
    lineSoft: mixHexColors(safeAccent, '#FFFFFF', 0.84),
  };
}

/* ══════════════════════════════════════
   메인 래퍼 — 컬러피커 + 유형 탭 토글
══════════════════════════════════════ */
export default function CaptchaDemo({ onClick, onClose }) {
  const [type, setType] = useState(1);
  const [theme, setTheme] = useState('orange');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [themeMode] = useState(currentThemeMode);
  const pickerRef = useRef(null);
  const palette = buildDemoPalette(theme);
  const normalizedCustomHex = normalizeHexColor(theme);
  const pickerHex = normalizedCustomHex || palette.accent;
  const pickerHsv = hexToHsv(pickerHex);
  const demoThemeStyle = {
    '--orange': palette.accent,
    '--orange-2': palette.accentDeep,
    '--gold': palette.highlight,
    '--peach': palette.soft,
    '--peach-deep': palette.softDeep,
    '--line': palette.line,
    '--line-soft': palette.lineSoft,
    '--captcha-on-accent': palette.foreground,
  };

  useEffect(() => {
    if (!pickerOpen) return undefined;

    const handleOutsidePointer = (event) => {
      if (!pickerRef.current?.contains(event.target)) setPickerOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPickerOpen(false);
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [pickerOpen]);

  // 밝기가 너무 낮으면(거의 검정) 다크모드에서, 너무 높으면(거의 흰색) 라이트모드에서
  // accent 색이 배경과 구분되지 않아 위젯 전체가 안 보이게 됨 — 최소/최대 밝기를 강제
  const MIN_ACCENT_VALUE = 50;
  const MAX_ACCENT_VALUE = 92;
  const clampAccentValue = (v) => Math.min(MAX_ACCENT_VALUE, Math.max(MIN_ACCENT_VALUE, v));

  const updateSaturation = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const verticalRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    // 박스 세로 전체를 안전 밝기 범위(MIN~MAX)에 그대로 매핑 — 맨 위 = MAX, 맨 아래 = MIN
    const value = MAX_ACCENT_VALUE - verticalRatio * (MAX_ACCENT_VALUE - MIN_ACCENT_VALUE);
    setTheme(hsvToHex({ h: pickerHsv.h, s: saturation * 100, v: value }));
  };

  return (
    <div className={`demo theme-experience-demo captcha-type-${type}`} id="demo" onClick={onClick} style={demoThemeStyle}>
      <div className="demo-theme-toolbar">
        <div className="demo-theme-title">
          <strong>CAPTCHA 테마 체험</strong>
          <span>컬러 피커 또는 색상 값을 바꾸면 바로 반영됩니다.</span>
        </div>
        <div className="demo-theme-controls" ref={pickerRef}>
          <div className="demo-theme-hex selected">
            <button
              type="button"
              className="demo-theme-swatch"
              aria-label="색상 선택창 열기"
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
              style={{ '--swatch-color': pickerHex }}
            />
            <input
              type="text"
              maxLength={7}
              value={CAPTCHA_THEME_PRESETS[theme]?.accent || theme}
              onChange={(event) => setTheme(event.target.value)}
              onBlur={() => {
                const normalized = normalizeHexColor(theme);
                if (normalized) {
                  const hsv = hexToHsv(normalized);
                  setTheme(hsvToHex({ ...hsv, v: clampAccentValue(hsv.v) }));
                }
              }}
              aria-label="체험할 HEX 색상 입력"
              placeholder="#7C5CE7"
            />
          </div>
          {pickerOpen && (
            <div className="demo-color-popover" role="dialog" aria-label="테마 색상 선택">
              <div className="demo-color-popover-head">
                <div>
                  <span style={{ background: pickerHex }} />
                  <strong>색상 선택</strong>
                </div>
                <button type="button" onClick={() => setPickerOpen(false)} aria-label="색상 선택창 닫기">×</button>
              </div>

              <div
                className="demo-color-field"
                style={{ '--picker-hue': `hsl(${pickerHsv.h} 100% 50%)` }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateSaturation(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSaturation(event);
                }}
                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                role="slider"
                aria-label="채도와 밝기 선택"
                aria-valuetext={pickerHex}
                tabIndex={0}
              >
                <span
                  className="demo-color-field-cursor"
                  style={{
                    left: `${pickerHsv.s}%`,
                    top: `${((MAX_ACCENT_VALUE - pickerHsv.v) / (MAX_ACCENT_VALUE - MIN_ACCENT_VALUE)) * 100}%`,
                    background: pickerHex,
                  }}
                />
              </div>

              <div className="demo-color-hue-row">
                <span className="demo-color-preview" style={{ background: pickerHex }} />
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={pickerHsv.h}
                  onChange={(event) => setTheme(hsvToHex({ ...pickerHsv, h: Number(event.target.value), v: clampAccentValue(pickerHsv.v) }))}
                  aria-label="색조 선택"
                />
              </div>

              <div className="demo-color-popover-foot">
                <code>{pickerHex}</code>
                <button type="button" onClick={() => setPickerOpen(false)}>선택 완료</button>
              </div>
            </div>
          )}
        </div>
        {onClose && (
          <button type="button" className="demo-theme-close" onClick={onClose} aria-label="체험창 닫기">×</button>
        )}
      </div>
      <div className="demo-top">
        <div className="dots" aria-hidden="true">
          <i className={`demo-type-indicator ${type === 1 ? 'is-active' : 'is-inactive'}`} />
          <i className={`demo-type-indicator ${type === 2 ? 'is-active' : 'is-inactive'}`} />
        </div>
        <div className="demo-type-tabs">
          {[1, 2].map(t => (
            <button
              key={t}
              type="button"
              className={`demo-type-tab ${type === t ? 'is-active' : 'is-inactive'}`}
              onClick={() => setType(t)}
              aria-pressed={type === t}
            >
              유형 {t}
            </button>
          ))}
        </div>
      </div>

      {type === 1
        ? <DragCaptcha key="t1" siteKey={DEMO_SITE_KEY} themeMode={themeMode} />
        : <MatchDragCaptcha key="t2" siteKey={DEMO_SITE_KEY} themeMode={themeMode} />}
    </div>
  );
}
