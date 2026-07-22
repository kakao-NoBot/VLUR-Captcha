// Hero.jsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CaptchaDemo from './CaptchaDemo';

export default function Hero({ openPage }) {
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = demoOpen ? 'hidden' : '';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDemoOpen(false);
    };
    if (demoOpen) window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [demoOpen]);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-content">
          <div
            style={{
              maxWidth: "760px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <span className="eyebrow">Secure Access, Verified Humans</span>
            <h1>지능형 사용자 <span className="hl">검증</span>으로,<br/>봇을 <span className="hl">차단</span>하는 <span style={{ whiteSpace: 'nowrap' }}>보안 솔루션</span></h1>
            <p className="lead">
              ASCII 아트 기반 이미지 선택과 드래그 궤적 분석을 통해 자동화 공격으로부터 서비스를 보호하세요.
            </p>
            <div className="hero-cta" style={{ justifyContent: 'center', position: 'relative', zIndex: 10 }}>
              <a className="btn btn-outline btn-lg" href="#pricing" onClick={e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }}>요금제 보기</a>
              <button className="btn btn-primary btn-lg" onClick={() => setDemoOpen(true)}>지금 체험하기</button>
            </div>
            <div className="hero-meta">
              <div><span className="n">6.9s</span><span className="l">평균 통과 시간</span></div>
              <div><span className="n">-%</span><span className="l">봇 차단율</span></div>
              <div><span className="n">-ms</span><span className="l">검증 응답</span></div>
            </div>
          </div>
        </div>
      </section>

      {demoOpen && createPortal(
        <div
          className="demo-modal-backdrop"
          onClick={() => setDemoOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            zIndex: 9999,
          }}
        >
          <CaptchaDemo onClick={(e) => e.stopPropagation()} onClose={() => setDemoOpen(false)} />
        </div>,
        document.body
      )}
    </>
  );
}
