// CaptchaWidgetCore.jsx
// VLUR CAPTCHA의 유일한 정본(canonical) 인터랙션 구현. 문제 데이터·정답 판정·봇 의심 점수
// 계산은 전부 AI-Captcha 백엔드의 공개 API(challenge/verify, Site Key 인증)에서 가져온다 —
// 이 컴포넌트는 정답을 알지 못하며, 드래그 궤적만 서버로 보내 결과를 받는다.
//
// frontend(vlur.site)의 마케팅 데모(components/CaptchaDemo.jsx)와 임베드 스크립트
// (widget/main.jsx) 둘 다 이 파일 하나만 import한다 — 실제 게임 UI를 여기서 한 번만 고치면
// 두 곳(그리고 이 스크립트를 불러쓰는 모든 제3자 사이트)에 그대로 반영된다.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchChallenge, verifyChallenge, resolveAssetUrl } from '../api/vlurCaptchaClient';
import { mixHexColors, normalizeHexColor } from '../utils/captchaTheme';

const DEFAULT_THEME = {
  accent: '#F0691E',
  soft: '#FBEBDD',
  foreground: '#FFFFFF',
};

export function buildThemeStyle(theme) {
  const accent = normalizeHexColor(theme?.accent) || DEFAULT_THEME.accent;
  const soft = normalizeHexColor(theme?.soft) || mixHexColors(accent, '#FFFFFF', 0.88);
  return {
    '--orange': accent,
    '--orange-2': mixHexColors(accent, '#000000', 0.18),
    '--gold': mixHexColors(accent, '#FFFFFF', 0.25),
    '--peach': soft,
    '--peach-deep': mixHexColors(accent, '#FFFFFF', 0.78),
    '--line': mixHexColors(accent, '#FFFFFF', 0.72),
    '--line-soft': mixHexColors(accent, '#FFFFFF', 0.84),
    '--captcha-on-accent': normalizeHexColor(theme?.foreground) || DEFAULT_THEME.foreground,
  };
}

export function useAutoFitScale(ref, verticalMargin = 24, minScale = 0.6) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const recalc = () => {
      el.style.zoom = '1';
      const naturalHeight = el.scrollHeight;
      const available = window.innerHeight - verticalMargin * 2;
      const next = Math.min(1, Math.max(minScale, available / naturalHeight));
      el.style.zoom = String(next);
    };

    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
      el.style.zoom = '';
    };
  }, [ref, verticalMargin, minScale]);
}

/* ══════════════════════════════════════
   공통 결과 화면
══════════════════════════════════════ */
export function SuccessScreen({ onReset }) {
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-check-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M7 17.5 13.5 24 27 10" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>인증 성공!</strong>
      </div>
      <button className="demo-retry-btn" onClick={onReset}>다시 체험하기</button>
    </div>
  );
}

export function FailScreen({ onReset, title = '인증 실패', desc = '' }) {
  return (
    <div className="demo-body demo-success-body">
      <div className="demo-fail-circle">
        <svg viewBox="0 0 34 34" fill="none" width={36} height={36}>
          <path d="M10 10 24 24M24 10 10 24" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="demo-success-msg">
        <strong>{title}</strong>
        {desc && <span>{desc}</span>}
      </div>
      <button className="demo-retry-btn" onClick={onReset}>다시 시도하기</button>
    </div>
  );
}

export function StatusScreen({ text }) {
  return (
    <div className="demo-body demo-success-body">
      <span>{text}</span>
    </div>
  );
}

/* ══════════════════════════════════════
   경유 지점 드래그 공통 로직 (유형1·유형2 공용)
   타일을 드롭존까지 끌고 가는 동안 경유 지점을 순서대로 모두 지나야만 제출이 인정된다 —
   드래그 궤적 검증을 시각적으로 보여줌. 문제 발급·정답 판정은 전부 서버 API가 담당한다.
══════════════════════════════════════ */

const DRAG_GAP_PX = 180; // 타일과 드롭존 사이 여백(px)
const COMPACT_TRACK_HEIGHT = 176; // 유형2(선택지 매칭)용 트랙 높이

const WAYPOINT_LEFT_MIN = 15;   // %
const WAYPOINT_LEFT_MAX = 85;   // %
const WAYPOINT_TOP_MARGIN = 48; // px, 트랙 상/하 여백
const WAYPOINT_TRACK_TOP_GAP = 24; // px, 트랙과 바로 위 요소 사이 여백
const WAYPOINT_MIN_GAP = 110;   // 두 경유 지점이 너무 가깝게 겹치지 않게 하는 최소 거리(px 환산)
const WAYPOINT_RADIUS_PX = 41;
const DROP_ZONE_ID = 'captcha-drop-drag';

function randomWaypoints(trackHeight, count = 2) {
  const points = [];
  let attempts = 0;
  while (points.length < count && attempts < 60) {
    attempts++;
    const leftPct = WAYPOINT_LEFT_MIN + Math.random() * (WAYPOINT_LEFT_MAX - WAYPOINT_LEFT_MIN);
    const top = WAYPOINT_TOP_MARGIN + Math.random() * (trackHeight - WAYPOINT_TOP_MARGIN * 2);
    const leftPx = leftPct * 3.6;
    const tooClose = points.some(p => Math.hypot(leftPx - p.leftPx, top - p.top) < WAYPOINT_MIN_GAP);
    if (!tooClose) points.push({ left: `${leftPct.toFixed(1)}%`, top: Math.round(top), leftPx });
  }
  while (points.length < count) {
    const i = points.length;
    const leftPct = WAYPOINT_LEFT_MIN + (i * (WAYPOINT_LEFT_MAX - WAYPOINT_LEFT_MIN)) / Math.max(1, count - 1);
    const top = WAYPOINT_TOP_MARGIN + Math.random() * (trackHeight - WAYPOINT_TOP_MARGIN * 2);
    points.push({ left: `${leftPct.toFixed(1)}%`, top: Math.round(top) });
  }
  return points.map(({ left, top }) => ({ left, top }));
}

function isVisitOrderCorrect(visitOrder, count) {
  return visitOrder.length === count && visitOrder.every((idx, pos) => idx === pos);
}

export function useCaptchaChallenge(captchaType, siteKey, onVerified, { onEscalate, onTheme, themeMode = 'light', trackHeight = DRAG_GAP_PX } = {}) {
  const [challenge, setChallenge] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [selected, setSelected] = useState(null);
  const [solved, setSolved] = useState(false);
  const [dropState, setDropState] = useState('idle');
  const [ghost, setGhost] = useState(null);
  const [screen, setScreen] = useState(null);
  const [waypoints, setWaypoints] = useState(() => randomWaypoints(trackHeight));
  const [visited, setVisited] = useState(() => waypoints.map(() => false));
  const [missedHint, setMissedHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedRef = useRef(null);
  const solvedRef = useRef(false);
  const submittingRef = useRef(false);
  const visitedRef = useRef(visited);
  const visitOrderRef = useRef([]);
  const waypointRefs = useRef([]);
  const waypointPositionsRef = useRef([]);
  // document.getElementById(DROP_ZONE_ID)로 드롭존을 찾으면 Shadow DOM 안에서는(임베드
  // 위젯) 항상 null이 나온다 — Shadow 트리 내부의 id는 최상위 document의 id 인덱스에
  // 잡히지 않기 때문. Shadow 경계와 무관하게 항상 실제 노드를 가리키는 ref로 찾는다.
  const dropRef = useRef(null);
  const pointerTypeRef = useRef('mouse');
  const samplesRef = useRef([]);
  const challengeRef = useRef(null);
  const mountedRef = useRef(true);
  selectedRef.current = selected;
  solvedRef.current = solved;
  submittingRef.current = submitting;
  visitedRef.current = visited;
  challengeRef.current = challenge;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadChallenge = useCallback(() => {
    setLoadState('loading');
    setChallenge(null);
    setSelected(null);
    setSolved(false);
    setDropState('idle');
    setScreen(null);
    const nextWaypoints = randomWaypoints(trackHeight);
    setWaypoints(nextWaypoints);
    setVisited(nextWaypoints.map(() => false));
    visitOrderRef.current = [];
    setMissedHint(false);
    fetchChallenge(captchaType, siteKey, themeMode)
      .then((data) => {
        if (!mountedRef.current) return;
        setChallenge(data);
        onTheme?.(data.theme);
        setLoadState('ready');
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadState('error');
      });
  }, [captchaType, siteKey, themeMode, trackHeight, onTheme]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  const submit = useCallback((optionId, dropPosition) => {
    const current = challengeRef.current;
    if (!current || submittingRef.current) return;
    setSubmitting(true);
    const samples = samplesRef.current;
    const responseTimeMs = samples.length >= 2
      ? Math.round(samples[samples.length - 1].t - samples[0].t)
      : null;
    const startCenter = samples.length ? { x: samples[0].x, y: samples[0].y } : dropPosition;
    const dropRect = dropRef.current?.getBoundingClientRect();
    const dropCenter = dropRect
      ? { x: dropRect.left + dropRect.width / 2, y: dropRect.top + dropRect.height / 2 }
      : dropPosition;

    verifyChallenge({
      challengeToken: current.challengeToken,
      selectedOptionId: optionId,
      dropPosition,
      dragTrace: samples,
      responseTimeMs,
      pointerType: pointerTypeRef.current,
      waypoints: waypointPositionsRef.current.map((c, i) => ({ x: c.x, y: c.y, order: i })),
      startCenter,
      dropCenter,
    }, siteKey)
      .then((result) => {
        if (!mountedRef.current) return;
        if (result.verified) {
          setSolved(true);
          solvedRef.current = true;
          setDropState('done');
          setScreen('success');
          onVerified?.();
          return;
        }
        // 어떤 사유로 실패하든(오답·애매한 점수·봇 차단) 같은 유형을 곧바로 재시도시키지 않고
        // 다른 유형으로 넘겨 한 번 더 검증한다(onEscalate가 주어진 경우) — 유형1↔유형2를 번갈아 검증.
        if (result.blocked) {
          if (onEscalate) onEscalate(); else setScreen('bot-blocked');
          return;
        }
        if (result.ambiguous) {
          if (onEscalate) onEscalate(); else setScreen('ambiguous');
          return;
        }
        if (onEscalate) onEscalate(); else setScreen('fail');
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setScreen('network-error');
      })
      .finally(() => {
        if (mountedRef.current) setSubmitting(false);
      });
  }, [onVerified, onEscalate, siteKey]);

  // 드래그(포인터 다운→이동→드롭)로만 제출 가능. 클릭만으로는 제출되지 않음.
  const onPointerDown = useCallback((e, optionId) => {
    if (solvedRef.current || submittingRef.current || !challengeRef.current) return;
    const opt = challengeRef.current.options.find((o) => o.option_id === optionId);
    setSelected(optionId);
    setGhost({ imageUrl: opt?.image_url, x: e.clientX, y: e.clientY });
    setMissedHint(false);
    const freshVisited = waypoints.map(() => false);
    visitedRef.current = freshVisited;
    setVisited(freshVisited);
    visitOrderRef.current = [];
    samplesRef.current = [{ x: e.clientX, y: e.clientY, t: 0 }];
    pointerTypeRef.current = e.pointerType || 'mouse';
    const dragStart = performance.now();
    waypointPositionsRef.current = waypointRefs.current.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    const onMove = (ev) => {
      setGhost({ imageUrl: opt?.image_url, x: ev.clientX, y: ev.clientY });
      samplesRef.current.push({ x: ev.clientX, y: ev.clientY, t: performance.now() - dragStart });

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

      const drop = dropRef.current;
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        setDropState(isOver ? (isVisitOrderCorrect(visitOrderRef.current, waypoints.length) ? 'hot' : 'blocked') : 'idle');
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      setGhost(null);
      samplesRef.current.push({ x: ev.clientX, y: ev.clientY, t: performance.now() - dragStart });
      const drop = dropRef.current;
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        const inOrder = isVisitOrderCorrect(visitOrderRef.current, waypoints.length);
        if (isOver && inOrder && selectedRef.current) {
          submit(selectedRef.current, { x: ev.clientX, y: ev.clientY });
        } else if (isOver && !inOrder) {
          setMissedHint(true);
        }
      }
      setDropState(d => (d === 'hot' || d === 'blocked') ? 'idle' : d);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    e.preventDefault();
  }, [submit, waypoints]);

  return {
    challenge, loadState, selected, ghost, dropState, visited, missedHint, screen, submitting,
    waypoints, waypointRefs, dropRef, reset: loadChallenge, onPointerDown,
  };
}

export function WaypointTrack({ waypointRefs, visited, waypoints, height }) {
  return (
    <div style={{ position: 'relative', height, marginTop: WAYPOINT_TRACK_TOP_GAP }}>
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

export function DropZone({ dropRef, dropState, missedHint, submitting }) {
  const dropClass = `drop${dropState === 'hot' ? ' hot' : ''}${dropState === 'blocked' ? ' blocked' : ''}${dropState === 'done' ? ' done' : ''}`;
  return (
    <div className={dropClass} id={DROP_ZONE_ID} ref={dropRef}>
      <div className="cart">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>
          <path d="M2.5 3h2l2.2 12.4a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/>
        </svg>
      </div>
      <div className="dtxt">
        {submitting
          ? <><b>확인 중…</b><span>서버에 드래그 결과를 전송하고 있어요</span></>
          : dropState === 'done'
          ? <><b style={{ color: 'var(--ok)' }}>사람 확인 완료 ✓</b><span>드래그 궤적 정상 · 토큰 발급됨</span></>
          : dropState === 'blocked'
          ? <><b style={{ color: 'var(--bad, #d8492f)' }}>경유 지점을 먼저 지나주세요</b><span>순서대로 통과한 뒤 놓아주세요</span></>
          : missedHint
          ? <><b style={{ color: 'var(--bad, #d8492f)' }}>경유점을 순서대로 이동해주세요</b><span>다시 시도해 주세요</span></>
          : <><b>여기에 담아주세요.</b><span>경유점을 순서대로 지나 이동하세요</span></>}
      </div>
    </div>
  );
}

// document.body로 포탈하면(기존 동작) 마케팅 데모(일반 DOM)에서는 문제없지만, 임베드
// 위젯(Shadow DOM) 안에서는 body가 shadow 트리 밖이라 위젯 CSS(.ghost 크기 제한 등)가
// 전혀 안 닿아 이미지가 원본 크기로 깨져 보인다. main.jsx가 shadow root 안에 만들어 둔
// 전용 컨테이너를 portalContainer로 넘겨주면 그 안으로 포탈해서 같은 <style>의 적용을
// 받는다 — 넘기지 않으면(마케팅 데모) 기존처럼 document.body를 그대로 쓴다.
export function GhostTile({ ghost, portalContainer = document.body }) {
  if (!ghost) return null;
  return createPortal(
    <div className="ghost" style={{ left: ghost.x, top: ghost.y, position: 'fixed' }}>
      {ghost.imageUrl && <img src={resolveAssetUrl(ghost.imageUrl)} alt="" className="tile-photo" />}
    </div>,
    portalContainer
  );
}

/* ══════════════════════════════════════
   4지선다 보기 중 정답을 경유 지점을 지나 드롭존까지 드래그 (유형 2)
══════════════════════════════════════ */
export function MatchDragCaptcha({ siteKey, onVerified, onEscalate, onTheme, themeMode, portalContainer }) {
  const { challenge, loadState, selected, ghost, dropState, visited, missedHint, screen, submitting, waypoints, waypointRefs, dropRef, reset, onPointerDown } =
    useCaptchaChallenge('type2_identify', siteKey, onVerified, { onEscalate, onTheme, themeMode, trackHeight: COMPACT_TRACK_HEIGHT });

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;
  if (screen === 'bot-blocked') return <FailScreen onReset={reset} title="인증이 제한되었습니다" desc="자동화된 시도로 판단되어 인증을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요." />;
  if (screen === 'ambiguous') return <FailScreen onReset={reset} title="추가 확인이 필요합니다" desc="본인 확인을 위해 다시 한번 시도해 주세요." />;
  if (screen === 'network-error') return <FailScreen onReset={reset} title="네트워크 오류" desc="서버와 통신하지 못했습니다. 다시 시도해 주세요." />;
  if (loadState === 'error') return <FailScreen onReset={reset} title="문제를 불러오지 못했습니다" desc="네트워크 상태를 확인하고 다시 시도해 주세요." />;
  if (loadState === 'loading' || !challenge) return <StatusScreen text="문제를 불러오는 중입니다…" />;

  return (
    <div className="demo-body demo-body-type2">
      <div className="demo-q">
        <span>아래 <b style={{ color: 'var(--orange)' }}>이미지</b>와 동일한 대상을 찾아 드래그하세요</span>
      </div>

      <div className="captcha-reference">
        <img src={resolveAssetUrl(challenge.questionImageUrl)} alt="문제 이미지" />
      </div>

      <div className="tiles choice-tiles">
        {challenge.options.map(opt => (
          <button
            key={opt.option_id}
            className={`tile${selected === opt.option_id ? ' sel' : ''}`}
            type="button"
            aria-label={opt.label + ' 선택'}
            onPointerDown={e => onPointerDown(e, opt.option_id)}
          >
            <img src={resolveAssetUrl(opt.image_url)} alt="" className="tile-photo" />
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} waypoints={waypoints} height={COMPACT_TRACK_HEIGHT} />
      <DropZone dropRef={dropRef} dropState={dropState} missedHint={missedHint} submitting={submitting} />

      <div className="demo-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>

      <GhostTile ghost={ghost} portalContainer={portalContainer} />
    </div>
  );
}

/* ══════════════════════════════════════
   드래그-투-타깃 CAPTCHA (유형 1)
══════════════════════════════════════ */
export function DragCaptcha({ siteKey, onVerified, onEscalate, onTheme, themeMode, portalContainer }) {
  const { challenge, loadState, selected, ghost, dropState, visited, missedHint, screen, submitting, waypoints, waypointRefs, dropRef, reset, onPointerDown } =
    useCaptchaChallenge('type1_drag', siteKey, onVerified, { onEscalate, onTheme, themeMode, trackHeight: DRAG_GAP_PX });

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;
  if (screen === 'bot-blocked') return <FailScreen onReset={reset} title="인증이 제한되었습니다" desc="자동화된 시도로 판단되어 인증을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요." />;
  if (screen === 'network-error') return <FailScreen onReset={reset} title="네트워크 오류" desc="서버와 통신하지 못했습니다. 다시 시도해 주세요." />;
  if (loadState === 'error') return <FailScreen onReset={reset} title="문제를 불러오지 못했습니다" desc="네트워크 상태를 확인하고 다시 시도해 주세요." />;
  if (loadState === 'loading' || !challenge) return <StatusScreen text="문제를 불러오는 중입니다…" />;

  return (
    <div className="demo-body">
      <div className="demo-q">
        <img className="question-image" src={resolveAssetUrl(challenge.questionImageUrl)} alt="문제 이미지" />
      </div>

      <div className="tiles">
        {challenge.options.map(opt => (
          <button
            key={opt.option_id}
            className={`tile${selected === opt.option_id ? ' sel' : ''}`}
            type="button"
            aria-label={opt.label + ' 선택'}
            onPointerDown={e => onPointerDown(e, opt.option_id)}
          >
            <img src={resolveAssetUrl(opt.image_url)} alt="" className="tile-photo" />
          </button>
        ))}
      </div>

      <WaypointTrack waypointRefs={waypointRefs} visited={visited} waypoints={waypoints} height={DRAG_GAP_PX} />
      <DropZone dropRef={dropRef} dropState={dropState} missedHint={missedHint} submitting={submitting} />

      <div className="demo-foot" style={{ justifyContent: 'flex-end' }}>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>

      <GhostTile ghost={ghost} portalContainer={portalContainer} />
    </div>
  );
}

/* ══════════════════════════════════════
   임베드 위젯 전체 래퍼 — 유형1 실패 시 유형2로 자동 전환(escalation), 마케팅 데모의
   컬러피커/탭 chrome은 포함하지 않는다(components/CaptchaDemo.jsx가 그건 따로 씌운다).
   onVerified: 검증 성공 시 호스트 사이트로 알려주는 콜백
══════════════════════════════════════ */
export default function CaptchaWidget({ siteKey, onVerified, onClose, themeMode = 'light', portalContainer }) {
  const [type, setType] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [theme, setTheme] = useState(null);
  const themeStyle = buildThemeStyle(theme);
  const demoRef = useRef(null);
  useAutoFitScale(demoRef, 12, type === 2 ? 0.85 : 0.6);

  const handleEscalate = () => {
    setType((prev) => {
      if (prev === 1) return 2; // 유형1 실패 → 유형2로 전환(최초 1회)
      setRetryKey((k) => k + 1); // 이미 유형2면 유형은 유지, 새 문제만 재발급
      return prev;
    });
  };

  return (
    <div className={`demo captcha-type-${type}`} ref={demoRef} style={themeStyle}>
      {onClose && (
        <button type="button" className="widget-close" onClick={onClose} aria-label="닫기">×</button>
      )}
      {type === 1
        ? <DragCaptcha key={`t1-${retryKey}`} siteKey={siteKey} onVerified={onVerified} onEscalate={handleEscalate} onTheme={setTheme} themeMode={themeMode} portalContainer={portalContainer} />
        : <MatchDragCaptcha key={`t2-${retryKey}`} siteKey={siteKey} onVerified={onVerified} onEscalate={handleEscalate} onTheme={setTheme} themeMode={themeMode} portalContainer={portalContainer} />}
    </div>
  );
}
