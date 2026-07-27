// CaptchaDemo.jsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import {
  CAPTCHA_THEME_PRESETS,
  hexToHsv,
  hsvToHex,
  mixHexColors,
  normalizeHexColor,
  resolveCaptchaTheme,
} from '../utils/captchaTheme';

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
   타일을 드롭존까지 끌고 가는 동안 경유 지점을 순서대로(1→2) 모두 지나야만
   제출이 인정된다 — 드래그 궤적 검증을 시각적으로 보여줌.
   문제 발급·정답 판정은 전부 /captcha-demo 서버 API가 처리한다 — 정답을
   프론트 번들에 담아두지 않기 위함.
══════════════════════════════════════ */

// 타일과 드롭존 사이 여백(px) — 이 값을 키우면 드래그 거리가 길어짐
const DRAG_GAP_PX = 180; // 260 → 180으로 축소, 장바구니를 위로 당김

// 경유 지점을 지난 순서(인덱스)가 1번→2번(0,1,...) 그대로인지 검사.
// 어느 지점을 먼저 건드리든 표시(체크)는 그대로 되지만, 성공 판정은 이 순서일 때만 통과.
function isVisitOrderCorrect(visitOrder, count) {
  return visitOrder.length === count
    && visitOrder.every((idx, pos) => idx === pos);
}

function useWaypointDrag(captchaType, trackHeight) {
  const [challenge, setChallenge] = useState(null); // null | { challengeId, questionImageUrl, tiles }
  const [waypoints, setWaypoints] = useState(() => randomWaypoints(trackHeight));
  const [selected, setSelected] = useState(null);
  const [solved, setSolved] = useState(false);
  const [dropState, setDropState] = useState('idle');
  const [ghost, setGhost] = useState(null);
  const [screen, setScreen] = useState(null);
  const [visited, setVisited] = useState(() => waypoints.map(() => false));
  const [missedHint, setMissedHint] = useState(false);

  const selectedRef = useRef(null);
  const solvedRef = useRef(false);
  const visitedRef = useRef(visited);
  const visitOrderRef = useRef([]); // 경유 지점을 처음 지난 순서(인덱스) — 성공 판정은 이 순서가 0,1,...인지로 함
  const pendingRef = useRef(false);
  const waypointRefs = useRef([]);
  selectedRef.current = selected;
  solvedRef.current = solved;
  visitedRef.current = visited;

  const fetchChallenge = useCallback(() => {
    setChallenge(null);
    api.post('/captcha-demo/challenge', { captcha_type: captchaType }).then(({ data }) => {
      setChallenge({
        challengeId: data.challenge_id,
        questionImageUrl: data.question_image_url,
        tiles: data.options.map((o) => ({ key: o.option_key, name: o.label, imageUrl: o.image_url })),
      });
    });
  }, [captchaType]);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  const reset = useCallback(() => {
    const nextWaypoints = randomWaypoints(trackHeight);
    setWaypoints(nextWaypoints);
    setSelected(null);
    setSolved(false);
    setDropState('idle');
    setScreen(null);
    setVisited(nextWaypoints.map(() => false));
    visitOrderRef.current = [];
    setMissedHint(false);
    fetchChallenge();
  }, [trackHeight, fetchChallenge]);

  const submit = useCallback((tileKey) => {
    if (pendingRef.current || !challenge) return;
    pendingRef.current = true;
    api.post('/captcha-demo/verify', { challenge_id: challenge.challengeId, option_key: tileKey })
      .then(({ data }) => {
        if (data.verified) {
          setSolved(true);
          solvedRef.current = true;
          setDropState('done');
          setScreen('success');
        } else {
          setScreen('fail');
        }
      })
      .catch(() => setScreen('fail'))
      .finally(() => { pendingRef.current = false; });
  }, [challenge]);

  // 드래그(포인터 다운→이동→드롭)로만 제출 가능. 클릭만으로는 제출되지 않음.
  const onPointerDown = useCallback((e, key, imageUrl) => {
    if (solvedRef.current || !challenge) return;
    setSelected(key);
    setGhost({ key, imageUrl, x: e.clientX, y: e.clientY });
    setMissedHint(false);
    const freshVisited = waypoints.map(() => false);
    visitedRef.current = freshVisited;
    setVisited(freshVisited);
    visitOrderRef.current = [];

    const onMove = (ev) => {
      setGhost({ key, imageUrl, x: ev.clientX, y: ev.clientY });

      let changed = false;
      const nextVisited = [...visitedRef.current];
      for (let i = 0; i < nextVisited.length; i++) {
        if (nextVisited[i]) continue;
        const el = waypointRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        if (dist <= WAYPOINT_RADIUS_PX) {
          nextVisited[i] = true;
          visitOrderRef.current.push(i);
          changed = true;
        }
      }
      if (changed) {
        visitedRef.current = nextVisited;
        setVisited(nextVisited);
      }
      const drop = document.getElementById(DROP_ZONE_ID);
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        setDropState(isOver ? (isVisitOrderCorrect(visitOrderRef.current, waypoints.length) ? 'hot' : 'blocked') : 'idle');
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      setGhost(null);
      const drop = document.getElementById(DROP_ZONE_ID);
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        const inOrder = isVisitOrderCorrect(visitOrderRef.current, waypoints.length);
        if (isOver && inOrder && selectedRef.current) {
          submit(selectedRef.current);
        } else if (isOver && !inOrder) {
          setMissedHint(true);
        }
      }
      setDropState(d => (d === 'hot' || d === 'blocked') ? 'idle' : d);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    e.preventDefault();
  }, [submit, challenge, waypoints]);

  return { challenge, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown };
}

function WaypointTrack({ waypointRefs, visited, waypoints, height }) {
  return (
    <div style={{ position: 'relative', height }}>
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

// 경유 지점을 매 문제/시도마다 다른 위치에 배치
const WAYPOINT_LEFT_MIN = 15;   // %
const WAYPOINT_LEFT_MAX = 85;   // %
const WAYPOINT_TOP_MARGIN = 24; // px, 트랙 상/하 여백
const WAYPOINT_MIN_GAP = 110;   // 두 지점이 너무 가깝게 겹치지 않게 하는 최소 거리(px 환산)

function randomWaypoints(trackHeight, count = 2) {
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < 60) {
    attempts++;
    const leftPct = WAYPOINT_LEFT_MIN + Math.random() * (WAYPOINT_LEFT_MAX - WAYPOINT_LEFT_MIN);
    const top = WAYPOINT_TOP_MARGIN + Math.random() * (trackHeight - WAYPOINT_TOP_MARGIN * 2);
    const leftPx = leftPct * 3.6; // 컨테이너 폭 대략치로 스케일 변환
    const tooClose = points.some(p => Math.hypot(leftPx - p.leftPx, top - p.top) < WAYPOINT_MIN_GAP);
    if (!tooClose) points.push({ left: `${leftPct.toFixed(1)}%`, top: Math.round(top), leftPx });
  }
  while (points.length < count) { // 재시도 초과 시 균등 분산으로 폴백
    const i = points.length;
    const leftPct = WAYPOINT_LEFT_MIN + (i * (WAYPOINT_LEFT_MAX - WAYPOINT_LEFT_MIN)) / Math.max(1, count - 1);
    const top = WAYPOINT_TOP_MARGIN + Math.random() * (trackHeight - WAYPOINT_TOP_MARGIN * 2);
    points.push({ left: `${leftPct.toFixed(1)}%`, top: Math.round(top) });
  }
  return points.map(({ left, top }) => ({ left, top }));
}

const WAYPOINT_RADIUS_PX = 41;
const DROP_ZONE_ID = 'captcha-drop-drag';
const COMPACT_TRACK_HEIGHT = 136; // 유형2(MatchDragCaptcha)용 트랙 높이

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
      <img src={ghost.imageUrl} alt="" className="tile-photo" />
    </div>,
    document.body
  );
}

function DemoLoading() {
  return <div className="demo-body demo-loading">문제를 불러오는 중...</div>;
}

/* ══════════════════════════════════════
   4지선다 보기 중 정답을 경유 지점을 지나 드롭존까지 드래그
══════════════════════════════════════ */
function MatchDragCaptcha() {
  const { challenge, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown } =
    useWaypointDrag('type2_identify', COMPACT_TRACK_HEIGHT);

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;
  if (!challenge) return <DemoLoading />;

  return (
    <div className="demo-body demo-body-type2">
      <div className="demo-q">
        <span>아래 <b style={{ color: 'var(--orange)' }}>이미지</b>에 해당하는 보기를 경유 지점을 지나 끌어다 놓아주세요</span>
      </div>

      <div className="captcha-reference">
        <img src={challenge.questionImageUrl} alt="문제 이미지" />
      </div>

      <div className="tiles choice-tiles">
        {challenge.tiles.map(tile => (
          <button
            key={tile.key}
            className={`tile${selected === tile.key ? ' sel' : ''}`}
            type="button"
            aria-label={tile.name + ' 선택'}
            onPointerDown={e => onPointerDown(e, tile.key, tile.imageUrl)}
          >
            <img src={tile.imageUrl} alt="" className="tile-photo" />
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} waypoints={waypoints} height={COMPACT_TRACK_HEIGHT} />
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
  const { challenge, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown } =
    useWaypointDrag('type1_drag', DRAG_GAP_PX);

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;
  if (!challenge) return <DemoLoading />;

  return (
    <div className="demo-body">
      <div className="demo-q">
        <img
          className="question-image"
          src={challenge.questionImageUrl}
          alt="문제 이미지"
        />
      </div>

      <div className="tiles">
        {challenge.tiles.map(item => (
          <button
            key={item.key}
            className={`tile${selected === item.key ? ' sel' : ''}`}
            type="button"
            aria-label={item.name + ' 선택'}
            onPointerDown={e => onPointerDown(e, item.key, item.imageUrl)}
            // onClick 선택 로직 없음 — 드래그로만 선택/제출 가능
          >
            <img src={item.imageUrl} alt="" className="tile-photo" />
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} waypoints={waypoints} height={DRAG_GAP_PX} />
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

  // 밝기가 너무 낮으면(거의 검정) 다크모드에서, 너무 높으면(거의 흰색) 라이트모드에서
// accent 색이 배경과 구분되지 않아 위젯 전체가 안 보이게 됨 — 최소/최대 밝기를 강제
const MIN_ACCENT_VALUE = 50;
const MAX_ACCENT_VALUE = 92;
  const clampAccentValue = (v) => Math.min(MAX_ACCENT_VALUE, Math.max(MIN_ACCENT_VALUE, v));

  const updateSaturation = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const saturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const value = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setTheme(hsvToHex({ h: pickerHsv.h, s: saturation * 100, v: clampAccentValue(value * 100) }));
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
