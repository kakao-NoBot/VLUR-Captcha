// CaptchaDemo.jsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import bananaAsciiDocs from '../assets/banana_ascii_docs.png';
import bananaAscii from '../assets/banana_ascii.jpg';
import bearAsciiDocs from '../assets/bear_ascii_docs.png';
import aircraftAsciiDocs from '../assets/Aircraft_ascii_docs.png';
import bearAscii from '../assets/bear_ascii.png';
import aircraftAscii from '../assets/Aircraft_ascii.png';

import bananaPhoto from '../assets/examples/banana_26.jpg';
import carrotPhoto from '../assets/examples/carrots_11.jpg';
import cherryPhoto from '../assets/examples/cherry_6.jpg';
import broccoliPhoto from '../assets/examples/broccoli_5.jpg';
import catPhoto from '../assets/examples/cat_5.jpg';
import dogPhoto from '../assets/examples/dog_7.jpg';
import bearPhoto from '../assets/examples/bear_25.jpg';
import chickenPhoto from '../assets/examples/chicken_10.jpeg';
import airplanePhoto from '../assets/examples/Aircraft_3.jpg';
import carPhoto from '../assets/examples/Car_1.jpg';
import bicyclePhoto from '../assets/examples/bicycle_9.jpg';
import applePhoto from '../assets/examples/apple_18.jpg';
import {
  CAPTCHA_THEME_PRESETS,
  hexToHsv,
  hsvToHex,
  mixHexColors,
  normalizeHexColor,
  resolveCaptchaTheme,
} from '../utils/captchaTheme';

/* ── 보기 이미지 ── */
const PHOTOS = {
  banana: bananaPhoto,
  carrot: carrotPhoto,
  cherry: cherryPhoto,
  broccoli: broccoliPhoto,
  cat: catPhoto,
  dog: dogPhoto,
  bear: bearPhoto,
  chicken: chickenPhoto,
  airplane: airplanePhoto,
  car: carPhoto,
  bicycle: bicyclePhoto,
  apple: applePhoto,
};

const GLYPHS = Object.fromEntries(
  Object.entries(PHOTOS).map(([key, src]) => [key, <img src={src} alt="" className="tile-photo" />])
);

/* ── 보기 이름 ── */
const TILE_NAMES = {
  banana: '바나나', carrot: '당근', cherry: '체리', broccoli: '브로콜리',
  cat: '고양이', dog: '강아지', bear: '곰', chicken: '치킨',
  airplane: '비행기', car: '자동차', bicycle: '자전거', apple: '사과',
};

function buildDemoPalette(theme) {
  const resolved = resolveCaptchaTheme(theme);
  return {
    ...resolved,
    accentDeep: mixHexColors(resolved.accent, '#000000', 0.18),
    highlight: mixHexColors(resolved.accent, '#FFFFFF', 0.25),
    softDeep: mixHexColors(resolved.accent, '#FFFFFF', 0.78),
    line: mixHexColors(resolved.accent, '#FFFFFF', 0.72),
    lineSoft: mixHexColors(resolved.accent, '#FFFFFF', 0.84),
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 정답 보기 하나 + 나머지 보기 풀에서 무작위로 뽑은 오답 3개로 매번 다른 보기 조합을 만든다
function buildOptions(correctKey, count = 4) {
  const pool = Object.keys(PHOTOS).filter((key) => key !== correctKey);
  const distractors = shuffle(pool).slice(0, count - 1);
  const options = [correctKey, ...distractors].map((key) => ({
    key, name: TILE_NAMES[key], correct: key === correctKey,
  }));
  return shuffle(options);
}

/* 유형 1: 드래그형 문제 세트 */
const QUESTIONS_TYPE1 = [
  { image: bananaAsciiDocs,   correctKey: 'banana' },
  { image: bearAsciiDocs,     correctKey: 'bear' },
  { image: aircraftAsciiDocs, correctKey: 'airplane' },
];

/* 유형 2: 경유 지점을 지나 정답 보기를 드롭존까지 드래그하는 문제 세트 */
const QUESTIONS_TYPE2 = [
  { image: bananaAscii,   correctKey: 'banana' },
  { image: bearAscii,     correctKey: 'bear' },
  { image: aircraftAscii, correctKey: 'airplane' },
];

// 문제 배열에서 이전과 다른 인덱스를 랜덤으로 뽑는다
function pickIndex(len, exclude) {
  if (len <= 1) return 0;
  let idx;
  do { idx = Math.floor(Math.random() * len); } while (idx === exclude);
  return idx;
}

/* ══════════════════════════════════════
   공통 결과 화면
══════════════════════════════════════ */
function SuccessScreen({ onReset }) {
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-check-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M7 17.5 13.5 24 27 10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>검증 성공!</strong>
        <span>사람으로 확인되었습니다</span>
      </div>
      <button className="demo-retry-btn" onClick={onReset}>다시 체험하기</button>
    </div>
  );
}

function FailScreen({ onReset }) {
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-fail-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M10 10 24 24M24 10 10 24" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>검증 실패</strong>
        <span>정답이 아닙니다. 다시 시도해 보세요.</span>
      </div>
      <button className="demo-retry-btn" onClick={onReset}>다시 체험하기</button>
    </div>
  );
}

/* ══════════════════════════════════════
   경유 지점 드래그 공통 로직 (유형1·유형2 공용)
   타일을 드롭존까지 끌고 가는 동안 경유 지점(WAYPOINTS)을 모두 지나야만
   제출이 인정된다 — 드래그 궤적 검증을 시각적으로 보여줌.
══════════════════════════════════════ */

// 타일과 드롭존 사이 여백(px) — 이 값을 키우면 드래그 거리가 길어짐
const DRAG_GAP_PX = 180; // 260 → 180으로 축소, 장바구니를 위로 당김

// 드래그 경로가 지나야 하는 경유 지점 (gap 영역 기준 좌: %, 상: px)
const WAYPOINTS = [
  { left: '28%', top: 50 },
  { left: '72%', top: 128 },
];
const WAYPOINT_RADIUS_PX = 41; // 표시 크기에 맞춰 통과 판정 범위도 함께 확대
const DROP_ZONE_ID = 'captcha-drop-drag';

function useWaypointDrag(questions) {
  const [state, setState] = useState(() => {
    const qi = Math.floor(Math.random() * questions.length);
    return { qi, tiles: buildOptions(questions[qi].correctKey) };
  });
  const [selected, setSelected] = useState(null);
  const [solved, setSolved] = useState(false);
  const [dropState, setDropState] = useState('idle');
  const [ghost, setGhost] = useState(null);
  const [screen, setScreen] = useState(null); // null | 'success' | 'fail'
  const [visited, setVisited] = useState(() => WAYPOINTS.map(() => false));
  const [missedHint, setMissedHint] = useState(false);

  const selectedRef = useRef(null);
  const solvedRef = useRef(false);
  const visitedRef = useRef(visited);
  const waypointRefs = useRef([]);
  selectedRef.current = selected;
  solvedRef.current = solved;
  visitedRef.current = visited;

  const question = questions[state.qi];

  const reset = useCallback(() => {
    setState(prev => {
      const qi = pickIndex(questions.length, prev.qi);
      return { qi, tiles: buildOptions(questions[qi].correctKey) };
    });
    setSelected(null);
    setSolved(false);
    setDropState('idle');
    setScreen(null);
    setVisited(WAYPOINTS.map(() => false));
    setMissedHint(false);
  }, [questions]);

  const submit = useCallback((tileKey) => {
    if (tileKey === question.correctKey) {
      setSolved(true);
      solvedRef.current = true;
      setDropState('done');
      setScreen('success');
    } else {
      setScreen('fail');
    }
  }, [question]);

  // 드래그(포인터 다운→이동→드롭)로만 제출 가능. 클릭만으로는 제출되지 않음.
  const onPointerDown = useCallback((e, key) => {
    if (solvedRef.current) return;
    setSelected(key);
    setGhost({ key, x: e.clientX, y: e.clientY });
    setMissedHint(false);
    const freshVisited = WAYPOINTS.map(() => false);
    visitedRef.current = freshVisited;
    setVisited(freshVisited);

    const onMove = (ev) => {
      setGhost({ key, x: ev.clientX, y: ev.clientY });

      let changed = false;
      const nextVisited = visitedRef.current.map((wasVisited, i) => {
        if (wasVisited) return true;
        const el = waypointRefs.current[i];
        if (!el) return wasVisited;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        if (dist <= WAYPOINT_RADIUS_PX) { changed = true; return true; }
        return wasVisited;
      });
      if (changed) {
        visitedRef.current = nextVisited;
        setVisited(nextVisited);
      }

      const drop = document.getElementById(DROP_ZONE_ID);
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        const allVisited = visitedRef.current.every(Boolean);
        setDropState(isOver ? (allVisited ? 'hot' : 'blocked') : 'idle');
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      setGhost(null);
      const drop = document.getElementById(DROP_ZONE_ID);
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        const allVisited = visitedRef.current.every(Boolean);
        if (isOver && allVisited && selectedRef.current) {
          submit(selectedRef.current);
        } else if (isOver && !allVisited) {
          setMissedHint(true);
        }
      }
      setDropState(d => (d === 'hot' || d === 'blocked') ? 'idle' : d);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    e.preventDefault();
  }, [submit]);

  return { state, question, selected, ghost, dropState, visited, missedHint, screen, waypointRefs, reset, onPointerDown };
}

function WaypointTrack({ waypointRefs, visited, compact = false }) {
  const waypoints = compact
    ? [{ left: '28%', top: 40 }, { left: '72%', top: 100 }]
    : WAYPOINTS;

  return (
    <div style={{ position: 'relative', height: compact ? 136 : DRAG_GAP_PX }}>
      {waypoints.map((wp, i) => (
        <div
          key={i}
          ref={el => { waypointRefs.current[i] = el; }}
          className={`drag-waypoint${visited[i] ? ' visited' : ''}`}
          style={{ left: wp.left, top: wp.top }}
        >
          {visited[i] ? '✓' : i + 1}
        </div>
      ))}
    </div>
  );
}

function DropZone({ dropState, missedHint }) {
  const dropClass = `drop${dropState === 'hot' ? ' hot' : ''}${dropState === 'blocked' ? ' blocked' : ''}${dropState === 'done' ? ' done' : ''}`;
  return (
    <div
      className={dropClass}
      id={DROP_ZONE_ID}
      // onClick 없음 — 드래그로 놓아야만 제출됨
    >
      <div className="cart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>
          <path d="M2.5 3h2l2.2 12.4a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/>
        </svg>
      </div>
      <div className="dtxt">
        {dropState === 'done'
          ? <><b style={{ color: 'var(--ok)' }}>사람 확인 완료 ✓</b><span>드래그 궤적 정상 · 토큰 발급됨</span></>
          : dropState === 'blocked'
          ? <><b style={{ color: 'var(--bad, #d8492f)' }}>경유 지점을 먼저 지나주세요</b><span>1·2번 지점을 통과한 뒤 놓아주세요</span></>
          : missedHint
          ? <><b style={{ color: 'var(--bad, #d8492f)' }}>경유 지점을 놓쳤어요</b><span>다시 시도해 주세요</span></>
          : <><b>여기로 드롭</b><span>경유 지점 1·2를 지나 끌어주세요</span></>}
      </div>
    </div>
  );
}

function GhostTile({ ghost }) {
  if (!ghost) return null;
  return createPortal(
    <div className="ghost" style={{ left: ghost.x, top: ghost.y, position: 'fixed' }}>
      {GLYPHS[ghost.key]}
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════
   4지선다 보기 중 정답을 경유 지점을 지나 드롭존까지 드래그
══════════════════════════════════════ */
function MatchDragCaptcha() {
  const { state, question, selected, ghost, dropState, visited, missedHint, screen, waypointRefs, reset, onPointerDown } =
    useWaypointDrag(QUESTIONS_TYPE2);

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;

  return (
    <div className="demo-body demo-body-type2">
      <div className="demo-q">
        <span>아래 <b style={{ color: 'var(--orange)' }}>이미지</b>에 해당하는 보기를 경유 지점을 지나 끌어다 놓아주세요</span>
      </div>

      <div className="captcha-reference">
        <img src={question.image} alt="문제 이미지" />
      </div>

      <div className="tiles choice-tiles">
        {state.tiles.map(tile => (
          <button
            key={tile.key}
            className={`tile${selected === tile.key ? ' sel' : ''}`}
            type="button"
            aria-label={tile.name + ' 선택'}
            onPointerDown={e => onPointerDown(e, tile.key)}
          >
            {GLYPHS[tile.key]}
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} compact />
      <DropZone dropState={dropState} missedHint={missedHint} />

      <div className="demo-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>

      <GhostTile ghost={ghost} />
    </div>
  );
}

/* ══════════════════════════════════════
   드래그-투-타깃 CAPTCHA
══════════════════════════════════════ */
function DragCaptcha() {
  const { state, question, selected, ghost, dropState, visited, missedHint, screen, waypointRefs, reset, onPointerDown } =
    useWaypointDrag(QUESTIONS_TYPE1);

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;

  return (
    <div className="demo-body">
      <div className="demo-q">
        <img
          className="question-image"
          src={question.image}
          alt="문제 이미지"
        />
      </div>

      <div className="tiles">
        {state.tiles.map(item => (
          <button
            key={item.key}
            className={`tile${selected === item.key ? ' sel' : ''}`}
            type="button"
            aria-label={item.name + ' 선택'}
            onPointerDown={e => onPointerDown(e, item.key)}
            // onClick 선택 로직 없음 — 드래그로만 선택/제출 가능
          >
            {GLYPHS[item.key]}
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} />
      <DropZone dropState={dropState} missedHint={missedHint} />

      <div className="demo-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>

      <GhostTile ghost={ghost} />
    </div>
  );
}

/* ══════════════════════════════════════
   메인 래퍼 — 유형 탭 토글
══════════════════════════════════════ */
export default function CaptchaDemo({ onClick, onClose }) {
  const [type, setType] = useState(1);
  const [theme, setTheme] = useState('orange');
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const updateSaturation = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const value = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setTheme(hsvToHex({ h: pickerHsv.h, s: saturation * 100, v: value * 100 }));
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
                if (normalized) setTheme(normalized);
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
                  style={{ left: `${pickerHsv.s}%`, top: `${100 - pickerHsv.v}%`, background: pickerHex }}
                />
              </div>

              <div className="demo-color-hue-row">
                <span className="demo-color-preview" style={{ background: pickerHex }} />
                <input
                  type="range"
                  min="0"
                  max="359"
                  value={pickerHsv.h}
                  onChange={(event) => setTheme(hsvToHex({ ...pickerHsv, h: Number(event.target.value) }))}
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
        <div className="dots">
          <i style={{ background: type === 1 ? 'var(--orange)' : 'var(--line)' }}/>
          <i style={{ background: type === 2 ? 'var(--orange)' : 'var(--line)' }}/>
        </div>
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {[1, 2].map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                fontFamily: 'var(--disp)', fontSize: 11, fontWeight: 700,
                letterSpacing: '.1em', padding: '3px 10px', borderRadius: 8,
                border: type === t ? 'none' : '1.5px solid color-mix(in srgb, var(--orange) 40%, var(--line))',
                background: type === t ? 'linear-gradient(90deg, var(--gold), var(--orange))' : 'color-mix(in srgb, var(--orange) 10%, var(--card))',
                color: type === t ? 'var(--captcha-on-accent, var(--paper))' : 'var(--orange-2)',
                cursor: 'pointer', transition: '.15s',
              }}
            >
              유형 {t}
            </button>
          ))}
        </div>
      </div>

      {type === 1 ? <DragCaptcha /> : <MatchDragCaptcha />}
    </div>
  );
}
