import React, { useEffect, useRef, useState } from 'react';

// 유형1 아이콘 세트로 통일 — 흰색(다크 배경용)/검은색(라이트 배경용) 둘 다 준비해두고
// 모달이 열린 시점의 사이트 다크모드에 맞춰 고른다(캡차 위젯과 동일한 방식).
import bananaWhite from '../assets/examples/type1/fruits/white/바나나.png';
import bananaBlack from '../assets/examples/type1/fruits/black/바나나.png';
import bearWhite from '../assets/examples/type1/animal/white/곰.png';
import bearBlack from '../assets/examples/type1/animal/black/곰.png';
import aircraftWhite from '../assets/examples/type1/vehicle/white/비행기.png';
import aircraftBlack from '../assets/examples/type1/vehicle/black/비행기.png';
import vlurLogo from '../assets/examples/logo/vlur-logo-transparent-hq-2x.png';

import bananaPhoto from '../assets/examples/mainimg/banana_26.jpg';
import carrotPhoto from '../assets/examples/mainimg/carrots_11.jpg';
import cherryPhoto from '../assets/examples/mainimg/cherry_6.jpg';
import broccoliPhoto from '../assets/examples/mainimg/broccoli_5.jpg';
import catPhoto from '../assets/examples/mainimg/cat_5.jpg';
import dogPhoto from '../assets/examples/mainimg/dog_7.jpg';
import bearPhoto from '../assets/examples/mainimg/bear_25.jpg';
import chickenPhoto from '../assets/examples/mainimg/chicken_10.jpeg';
import airplanePhoto from '../assets/examples/mainimg/Aircraft_3.jpg';
import carPhoto from '../assets/examples/mainimg/Car_1.jpg';
import bicyclePhoto from '../assets/examples/mainimg/bicycle_9.jpg';
import applePhoto from '../assets/examples/mainimg/apple_18.jpg';

// 유형1/유형2 모두 같은 아이콘을 보여준다(과거의 손그림/아스키 스타일 구분은 폐지됨).
const QUESTION_ICONS = {
  q1: { light: bananaBlack, dark: bananaWhite },
  q2: { light: bearBlack, dark: bearWhite },
  q3: { light: aircraftBlack, dark: aircraftWhite },
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

export default function LoginCaptchaModal({ challenge, busy, error, onVerify, onClose }) {
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const dropRef = useRef(null);
  const cleanupRef = useRef(null);
  const isDrag = challenge.captcha_type === 'type1_drag';
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const questionImage = QUESTION_ICONS[challenge.question_asset]?.[dark ? 'dark' : 'light'];

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