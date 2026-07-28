// CaptchaDemo.jsx

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import publicCaptchaApi from '../api/publicCaptcha';
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
function SuccessScreen({ onReset, result }) {
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

function FailScreen({ onReset, result }) {
  const blockedByModel = result?.blocked;
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-fail-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M10 10 24 24M24 10 10 24" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>검증 실패</strong>
        <span>{blockedByModel ? '드래그 궤적이 봇으로 판정되었습니다.' : '정답이 아닙니다. 다시 시도해 보세요.'}</span>
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
  const [loadError, setLoadError] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const selectedRef = useRef(null);
  const solvedRef = useRef(false);
  const visitedRef = useRef(visited);
  const visitOrderRef = useRef([]); // 경유 지점을 처음 지난 순서(인덱스) — 성공 판정은 이 순서가 0,1,...인지로 함
  const pendingRef = useRef(false);
  const waypointRefs = useRef([]);
  // 실제 봇 판별 모델(drag_classifier)에 넘길 드래그 텔레메트리 — 데모 정답 판정과 별개로
  // 이 값들을 그대로 /api/v1/captcha/verify에 실어 보낸다.
  const traceRef = useRef([]); // [{x,y,t}], t는 dragStartRef 기준 상대 ms
  const dragStartRef = useRef(0);
  const challengeStartRef = useRef(0); // 문제 노출 시각(response_time_ms 계산용)
  const pointerTypeRef = useRef('mouse');
  const startCenterRef = useRef(null);
  const waypointCentersRef = useRef([]); // 드래그 시작 시점 각 경유 지점의 화면 중심 좌표
  selectedRef.current = selected;
  solvedRef.current = solved;
  visitedRef.current = visited;

  const fetchChallenge = useCallback(() => {
    setChallenge(null);
    setLoadError(false);
    // 유형1 문제는 흰색(다크 배경용)/검은색(라이트 배경용) 아이콘 두 벌이 있어, 사이트
    // 전역 다크모드 토글(Nav.jsx가 <html data-theme>에 반영)에 맞는 쪽을 서버에 요청한다.
    const themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    publicCaptchaApi.post('/api/v1/captcha/challenge', { captcha_type: captchaType, theme_mode: themeMode }).then(({ data }) => {
      challengeStartRef.current = performance.now();
      setChallenge({
        challengeToken: data.challenge_token,
        questionImageUrl: data.question_image_url,
        // 서버가 보기 라벨(정답 카테고리)을 응답에 내려주지 않으므로(정답 유추 방지),
        // 접근성용 이름은 실제 내용과 무관한 위치 기반 이름으로 대체한다.
        tiles: data.options.map((o, i) => ({ key: String(o.option_id), name: `보기 ${i + 1}`, imageUrl: o.image_url })),
      });
    }).catch(() => {
      setLoadError(true);
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
    setLastResult(null);
    fetchChallenge();
  }, [trackHeight, fetchChallenge]);

  const submit = useCallback((tileKey, dropCenter) => {
    if (pendingRef.current || !challenge) return;
    pendingRef.current = true;
    const responseTimeMs = challengeStartRef.current
      ? Math.round(performance.now() - challengeStartRef.current)
      : null;
    publicCaptchaApi.post('/api/v1/captcha/verify', {
      challenge_token: challenge.challengeToken,
      selected_option_id: Number(tileKey),
      drop_position: dropCenter,
      drag_trace: traceRef.current,
      response_time_ms: responseTimeMs,
      pointer_type: pointerTypeRef.current,
      waypoints: waypointCentersRef.current.map((c, i) => ({ x: c.x, y: c.y, order: i })),
      start_center: startCenterRef.current,
      drop_center: dropCenter,
    })
      .then(({ data }) => {
        setLastResult(data);
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

    pointerTypeRef.current = e.pointerType || 'mouse';
    dragStartRef.current = performance.now();
    traceRef.current = [{ x: e.clientX, y: e.clientY, t: 0 }];
    const tileRect = e.currentTarget.getBoundingClientRect();
    startCenterRef.current = { x: tileRect.left + tileRect.width / 2, y: tileRect.top + tileRect.height / 2 };
    // 경유 지점은 드래그 중 위치가 바뀌지 않으므로 시작 시점에 한 번만 중심 좌표를 잰다.
    waypointCentersRef.current = waypointRefs.current.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    const onMove = (ev) => {
      traceRef.current.push({ x: ev.clientX, y: ev.clientY, t: performance.now() - dragStartRef.current });
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
      traceRef.current.push({ x: ev.clientX, y: ev.clientY, t: performance.now() - dragStartRef.current });
      const drop = document.getElementById(DROP_ZONE_ID);
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        const inOrder = isVisitOrderCorrect(visitOrderRef.current, waypoints.length);
        if (isOver && inOrder && selectedRef.current) {
          const dropCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          submit(selectedRef.current, dropCenter);
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

  return { challenge, loadError, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown, lastResult };
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
          ? <><b style={{ color: 'var(--bad, #d8492f)' }}>경유점을 순서대로 이동해주세요</b><span>다시 시도해 주세요</span></>
          : <><b>여기에 담아주세요.</b><span>경유점을 순서대로 지나 이동하세요</span></>}
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

function DemoError({ onRetry }) {
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-fail-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M10 10 24 24M24 10 10 24" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>문제를 불러오지 못했습니다</strong>
        <span>잠시 후 다시 시도해 주세요</span>
      </div>
      <button className="demo-retry-btn" onClick={onRetry}>다시 시도</button>
    </div>
  );
}

/* ══════════════════════════════════════
   4지선다 보기 중 정답을 경유 지점을 지나 드롭존까지 드래그
══════════════════════════════════════ */
function MatchDragCaptcha() {
  const { challenge, loadError, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown, lastResult } =
    useWaypointDrag('type2_identify', COMPACT_TRACK_HEIGHT);

  if (screen === 'success') return <SuccessScreen onReset={reset} result={lastResult} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} result={lastResult} />;
  if (loadError) return <DemoError onRetry={reset} />;
  if (!challenge) return <DemoLoading />;

  return (
    <div className="demo-body demo-body-type2">
      <div className="demo-q">
        <span>아래 <b style={{ color: 'var(--orange)' }}>이미지</b>와 동일한 대상을 찾아 드래그하세요</span>
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
  const { challenge, loadError, selected, ghost, dropState, visited, missedHint, screen, waypoints, waypointRefs, reset, onPointerDown, lastResult } =
    useWaypointDrag('type1_drag', DRAG_GAP_PX);

  if (screen === 'success') return <SuccessScreen onReset={reset} result={lastResult} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} result={lastResult} />;
  if (loadError) return <DemoError onRetry={reset} />;
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

      {type === 1 ? <DragCaptcha /> : <MatchDragCaptcha />}
    </div>
  );
}
