import React, { useEffect, useRef, useState } from 'react';

import bananaAsciiDocs from '../assets/banana_ascii_docs.png';
import bananaAscii from '../assets/banana_ascii.jpg';
import bearAsciiDocs from '../assets/bear_ascii_docs.png';
import bearAscii from '../assets/bear_ascii.png';
import aircraftAsciiDocs from '../assets/Aircraft_ascii_docs.png';
import aircraftAscii from '../assets/Aircraft_ascii.png';
import vlurLogo from '../assets/vlur-logo-transparent-hq-2x.png';

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

const QUESTION_IMAGES = {
  type1_drag: {
    q1: bananaAsciiDocs,
    q2: bearAsciiDocs,
    q3: aircraftAsciiDocs,
  },
  type2_identify: {
    q1: bananaAscii,
    q2: bearAscii,
    q3: aircraftAscii,
  },
};

const OPTION_IMAGES = {
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

const OPTION_LABELS = {
  banana: '바나나', carrot: '당근', cherry: '체리', broccoli: '브로콜리',
  cat: '고양이', dog: '강아지', bear: '곰', chicken: '치킨',
  airplane: '비행기', car: '자동차', bicycle: '자전거', apple: '사과',
};

export default function LoginCaptchaModal({ challenge, busy, error, onVerify, onRefresh, onClose }) {
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const dropRef = useRef(null);
  const cleanupRef = useRef(null);
  const isDrag = challenge.captcha_type === 'type1_drag';
  const questionImage = QUESTION_IMAGES[challenge.captcha_type]?.[challenge.question_asset];

  useEffect(() => {
    setSelected(null);
    setDragging(null);
  }, [challenge.challenge_id]);

  useEffect(() => () => cleanupRef.current?.(), []);

  const answer = (option) => {
    if (!busy) onVerify(option);
  };

  const beginDrag = (event, option) => {
    if (busy) return;
    event.preventDefault();
    setSelected(option);
    setDragging({ option, x: event.clientX, y: event.clientY });

    const onMove = (moveEvent) => {
      setDragging({ option, x: moveEvent.clientX, y: moveEvent.clientY });
    };
    const onUp = (upEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      cleanupRef.current = null;
      setDragging(null);
      const rect = dropRef.current?.getBoundingClientRect();
      if (
        rect
        && upEvent.clientX >= rect.left && upEvent.clientX <= rect.right
        && upEvent.clientY >= rect.top && upEvent.clientY <= rect.bottom
      ) {
        answer(option);
      }
    };
    cleanupRef.current?.();
    cleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return (
    <div className="login-captcha-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="login-captcha-modal" role="dialog" aria-modal="true" aria-labelledby="login-captcha-title">
        <div className="login-captcha-header">
          <div className="login-captcha-brand" aria-label="VLUR CAPTCHA">
            <img src={vlurLogo} alt="" />
            <strong>VLUR <em>CAPTCHA</em></strong>
          </div>
          <button type="button" className="login-captcha-close" onClick={onClose} disabled={busy} aria-label="CAPTCHA 닫기">×</button>
        </div>

        <div className={`login-captcha-content${isDrag ? ' is-drag' : ' is-identify'}`}>
          <div className="login-captcha-intro">
            <span className="login-captcha-shield" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.2 19 6v5.3c0 4.3-2.8 7.7-7 9.5-4.2-1.8-7-5.2-7-9.5V6l7-2.8Z" />
                <path d="m8.8 12.1 2.1 2.1 4.4-4.7" />
              </svg>
            </span>
            <h2 id="login-captcha-title">보안 확인</h2>
            <p>봇이 아닌지 확인하기 위해 보안 절차를 진행합니다.</p>
          </div>

          {!isDrag && <p className="login-captcha-instruction">아래 이미지에 해당하는 보기를 선택하세요.</p>}

          <div className={`login-captcha-question${isDrag ? ' is-drag' : ' is-identify'}`}>
            {questionImage && <img src={questionImage} alt="CAPTCHA 문제 이미지" />}
          </div>

          <div className="login-captcha-options">
            {challenge.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`login-captcha-option${selected === option ? ' selected' : ''}`}
                onClick={() => !isDrag && answer(option)}
                onPointerDown={(event) => isDrag && beginDrag(event, option)}
                disabled={busy}
                aria-label={`${OPTION_LABELS[option] || option} 선택`}
              >
                <img src={OPTION_IMAGES[option]} alt="" />
              </button>
            ))}
          </div>

          {isDrag ? (
            <div ref={dropRef} className={`login-captcha-drop${dragging ? ' ready' : ''}`}>
              <span className="login-captcha-cart" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>
                  <path d="M2.5 3h2l2.2 12.4a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/>
                </svg>
              </span>
              <span><b>여기로 드롭</b><small>천천히, 자연스럽게 끌어주세요</small></span>
            </div>
          ) : null}

          {error && <p className="login-captcha-error" role="alert">{error}</p>}

          <div className="login-captcha-actions">
            <button type="button" className="login-captcha-new" onClick={onRefresh} disabled={busy}>
              {busy ? '확인 중...' : '새로운 문제'}
            </button>
          </div>
        </div>

        {dragging && (
          <div className="login-captcha-ghost" style={{ left: dragging.x, top: dragging.y }} aria-hidden="true">
            <img src={OPTION_IMAGES[dragging.option]} alt="" />
          </div>
        )}
      </section>
    </div>
  );
}
