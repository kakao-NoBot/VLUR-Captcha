// CaptchaDemo.jsx

import React, { useState, useCallback, useRef } from 'react';
import cap1Question from '../assets/cap1_Question.png';
import bananaAscii from '../assets/banana_ascii.jpg';

/* ── SVG Glyphs ── */
const GLYPHS = {
  radish: (
    <svg viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="30" r="11" fill="#F4F0E8" stroke="#241B15" strokeWidth="2"/>
      <path d="M24 19c1-4 4-7 8-8-1 4-4 7-8 8Zm0 0c-1-4-4-7-8-8 1 4 4 7 8 8Z" fill="#7FB069"/>
      <path d="M24 19v-9" stroke="#7FB069" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  banana: (
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M10 13c2 13 11 23 26 24-3 4-9 6-15 4C12 38 7 27 9 15c0-1 1-2 1-2Z" fill="#F4A62A" stroke="#241B15" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M10 13c-1-2 0-4 2-4" stroke="#241B15" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  carrot: (
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M12 36 31 17l-1 9 8-2-20 19c-2 2-6 1-7-2-1-2 0-4 1-5Z" fill="#F0691E" stroke="#241B15" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M31 17c1-4 4-6 8-6m-8 6c0-4-2-7-5-8m5 8c4-1 6 1 7 4" stroke="#7FB069" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  pumpkin: (
    <svg viewBox="0 0 48 48" fill="none">
      <ellipse cx="24" cy="29" rx="15" ry="12" fill="#F0691E" stroke="#241B15" strokeWidth="2"/>
      <path d="M24 18v22M16 19c-3 4-3 16 0 21M32 19c3 4 3 16 0 21" stroke="#241B15" strokeWidth="1.6"/>
      <path d="M24 17c0-3 2-5 5-5" stroke="#7FB069" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

const POOL = [
  { key: 'radish',  name: '무',    correct: false },
  { key: 'banana',  name: '바나나', correct: true  },
  { key: 'carrot',  name: '당근',  correct: false },
  { key: 'pumpkin', name: '호박',  correct: false },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
   4지선다 클릭 CAPTCHA
══════════════════════════════════════ */
function ClickCaptcha() {
  const [tiles, setTiles] = useState(() => shuffle(POOL));
  const [screen, setScreen] = useState(null); // null | 'success' | 'fail'

  const reset = () => {
    setTiles(shuffle(POOL));
    setScreen(null);
  };

  const pick = (tile) => {
    if (screen) return;
    if (tile.correct) {
      setScreen('success');
    } else {
      setScreen('fail');
    }
  };

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;

  return (
    <div className="demo-body">
      <div className="demo-q">
        <span>아래 <b style={{ color: 'var(--orange)' }}>이미지</b>에 해당하는 보기를 선택해 주세요</span>
      </div>

      <div className="captcha-reference">
        <img src={bananaAscii} alt="바나나 ASCII 아트" />
      </div>

      <div className="tiles choice-tiles">
        {tiles.map(tile => (
          <button
            key={tile.key}
            className="tile"
            type="button"
            aria-label={tile.name + ' 선택'}
            onClick={() => pick(tile)}
          >
            {GLYPHS[tile.key]}
            <span className="cap">{tile.name}</span>
          </button>
        ))}
      </div>

      <div className="demo-foot">
        <div className="status">보기 중 정답을 클릭하세요.</div>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   드래그-투-타깃 CAPTCHA
══════════════════════════════════════ */
function DragCaptcha() {
  const [tiles, setTiles] = useState(() => shuffle(POOL));
  const [selected, setSelected] = useState(null);
  const [solved, setSolved] = useState(false);
  const [dropState, setDropState] = useState('idle');
  const [status, setStatus] = useState({ msg: '타일을 끌어다 놓거나, 클릭해서 선택하세요.', cls: '' });
  const [ghost, setGhost] = useState(null);
  const [screen, setScreen] = useState(null); // null | 'success' | 'fail'

  const selectedRef = useRef(null);
  const solvedRef = useRef(false);
  selectedRef.current = selected;
  solvedRef.current = solved;

  const reset = useCallback(() => {
    setTiles(shuffle(POOL));
    setSelected(null);
    setSolved(false);
    setDropState('idle');
    setStatus({ msg: '타일을 끌어다 놓거나, 클릭해서 선택하세요.', cls: '' });
    setScreen(null);
  }, []);

  const selectTile = useCallback((key) => {
    if (solvedRef.current) return;
    setSelected(key);
    setStatus({ msg: '선택됨 — 장바구니를 눌러 담으세요.', cls: '' });
  }, []);

  const submit = useCallback((tileKey) => {
    const tile = POOL.find(t => t.key === tileKey);
    if (!tile) return;
    if (tile.correct) {
      setSolved(true);
      solvedRef.current = true;
      setDropState('done');
      setScreen('success');
    } else {
      setScreen('fail');
    }
  }, []);

  const onPointerDown = useCallback((e, key) => {
    if (solvedRef.current) return;
    selectTile(key);
    setGhost({ key, x: e.clientX, y: e.clientY });
    const onMove = (ev) => {
      setGhost({ key, x: ev.clientX, y: ev.clientY });
      const drop = document.getElementById('captcha-drop-drag');
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        setDropState(isOver ? 'hot' : 'idle');
      }
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      setGhost(null);
      const drop = document.getElementById('captcha-drop-drag');
      if (drop) {
        const r = drop.getBoundingClientRect();
        const isOver = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (isOver && selectedRef.current) submit(selectedRef.current);
      }
      setDropState(d => d === 'hot' ? 'idle' : d);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    e.preventDefault();
  }, [selectTile, submit]);

  const dropClass = `drop${dropState === 'hot' ? ' hot' : ''}${dropState === 'done' ? ' done' : ''}`;

  if (screen === 'success') return <SuccessScreen onReset={reset} />;
  if (screen === 'fail')    return <FailScreen onReset={reset} />;

  return (
    <div className="demo-body">
      <div className="demo-q">
        <img
          className="question-image"
          src={cap1Question}
          alt="바나나를 장바구니로 드래그하세요"
        />

      </div>

      <div className="tiles">
        {tiles.map(item => (
          <button
            key={item.key}
            className={`tile${selected === item.key ? ' sel' : ''}`}
            type="button"
            aria-label={item.name + ' 선택'}
            onPointerDown={e => onPointerDown(e, item.key)}
            onClick={() => selectTile(item.key)}
          >
            {GLYPHS[item.key]}
            <span className="cap">{item.name}</span>
          </button>
        ))}
      </div>

      <div className={dropClass} id="captcha-drop-drag" onClick={() => { if (selected && !solved) submit(selected); }}>
        <div className="cart">
          <svg viewBox="0 0 24 24" fill="none" stroke="#F0691E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>
            <path d="M2.5 3h2l2.2 12.4a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/>
          </svg>
        </div>
        <div className="dtxt">
          {dropState === 'done'
            ? <><b style={{ color: 'var(--ok)' }}>사람 확인 완료 ✓</b><span>드래그 궤적 정상 · 토큰 발급됨</span></>
            : <><b>여기로 드롭</b><span>맞는 타일을 장바구니에 담아주세요</span></>}
        </div>
      </div>

      <div className="demo-foot">
        <div className={`status${status.cls ? ' ' + status.cls : ''}`}>{status.msg}</div>
        <button className="reset" onClick={reset}>새로운 문제</button>
      </div>

      {ghost && (
        <div className="ghost" style={{ left: ghost.x, top: ghost.y, position: 'fixed' }}>
          {GLYPHS[ghost.key]}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   메인 래퍼 — 유형 탭 토글
══════════════════════════════════════ */
export default function CaptchaDemo() {
  const [type, setType] = useState(1);

  return (
    <div className="demo" id="demo">
      <div className="demo-top">
        <div className="dots">
          <i style={{ background: type === 1 ? 'var(--orange)' : 'var(--line)' }}/>
          <i style={{ background: type === 2 ? 'var(--orange)' : 'var(--line)' }}/>
        </div>
        {/* 유형 탭 */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
          {[1, 2].map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                fontFamily: 'var(--disp)', fontSize: 11, fontWeight: 700,
                letterSpacing: '.1em', padding: '3px 10px', borderRadius: 8,
                border: type === t ? 'none' : '1.5px solid var(--line)',
                background: type === t ? 'linear-gradient(90deg, var(--gold), var(--orange))' : '#fff',
                color: type === t ? '#fff' : 'var(--muted)',
                cursor: 'pointer', transition: '.15s',
              }}
            >
              유형 {t}
            </button>
          ))}
        </div>
        <span className="tag">{type === 1 ? 'Live demo · 유형 1 드래그' : 'Live demo · 유형 2 선택'}</span>
      </div>

      {type === 1 ? <DragCaptcha /> : <ClickCaptcha />}
    </div>
  );
}
