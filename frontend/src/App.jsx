// App.jsx

import React, { useState, useEffect } from 'react';
import './styles/main.css';
import vlurLogo from './assets/vlur-logo-transparent-hq-2x.png';

// Layout components
import Nav from './components/Nav';
import Hero from './components/Hero';
import Compare from './components/Compare';
import Metrics from './components/Metrics';
import Flow from './components/Flow';
import Cases from './components/Cases';
import Pricing from './components/Pricing';
import Footer from './components/Footer';
import ChatbotWidget from './components/ChatbotWidget';

// Pages (overlays)
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import MypagePage from './pages/MypagePage';
import PaymentPage from './pages/PaymentPage';
import GuidePage from './pages/GuidePage';
import BoardPage from './pages/BoardPage';
import PlanPayPage from './pages/PlanPayPage';
import EnterprisePage from './pages/EnterprisePage';

const PAGE_TITLES = {
  login:      '로그인',
  signup:     '회원가입',
  mypage:     '마이페이지',
  payment:    '결제',
  guide:      '사용자 가이드',
  board:      '공지사항 / FAQ / CAPTCHA 연구',
  apply:      '이용 신청',
  'apply-done': '이용 신청 완료',
  'plan-pay': '요금제 결제',
};

function BrandLogo({ onClick }) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--line)', borderRadius: 8, width: 38, height: 38, flexShrink: 0 }}>
        <img src={vlurLogo} alt="VLUR" style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
      </div>
      <span style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 16, letterSpacing: '-.01em', color: 'var(--ink)' }}>
        VLUR <span style={{ color: 'var(--orange)' }}>CAPTCHA</span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button onClick={onClick} aria-label="홈으로" title="홈으로" style={{
        display: 'flex', alignItems: 'center', gap: 11,
        background: 'none', cursor: 'pointer',
        border: 'none', padding: 0,
      }}>
        {inner}
      </button>
    );
  }

  return <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{inner}</div>;
}

// Page overlay wrapper
function PageOverlay({ id, activePage, title, onBack, extra, children }) {
  const isActive = activePage === id;

  useEffect(() => {
    if (isActive) window.scrollTo(0, 0);
  }, [isActive]);

  return (
    <div className={`page-overlay${isActive ? ' active' : ''}`}>
      <div className="po-nav login-po-nav">
        <BrandLogo onClick={onBack} />
        {extra}
      </div>
      {children}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(null);
  const [planPayArgs, setPlanPayArgs] = useState({ plan: 'Pro' });
  const [mypageTab, setMypageTab] = useState('info');
  const [mypageKey, setMypageKey] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [boardDetailOpen, setBoardDetailOpen] = useState(false);

  const openPage = (id) => {
  if (id === 'board') setBoardDetailOpen(false);
  if (id === 'mypage') {
    setMypageTab('info');
    setMypageKey(k => k + 1);
  }
  setPage(id);
};
  const closePage = () => {
    setBoardDetailOpen(false);
    setPage(null);
  };
  const handleLogin = () => { setIsLoggedIn(true); closePage(); };
  const handleLogout = () => { setIsLoggedIn(false); closePage(); };

  const openPlanPayment = (plan) => {
    setPlanPayArgs({ plan });
    setPage('plan-pay');
  };

  const openMypageOnApiKey = () => {
  setMypageTab('apikey');
  setMypageKey(k => k + 1);
  setPage('mypage');
};

  // 오버레이가 열려 있을 때 최상위 스크롤까지 잠가 배경 페이지 노출 방지
  useEffect(() => {
    if (!page) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [page]);

  // 스크롤 진입 시 요소 표시 (IntersectionObserver) — 반복 재생
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;
    // data-reveal-delay 속성으로 JS 타이머를 제어해 빠른 스크롤에서도 순차 등장 보장
    const timers = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
            const id = setTimeout(() => {
              entry.target.classList.add('is-visible');
              timers.delete(entry.target);
            }, delay);
            timers.set(entry.target, id);
          } else if (entry.boundingClientRect.top > 0) {
            // 뷰포트 아래로 나간 경우(위로 스크롤)만 리셋 → 예약 타이머도 취소
            clearTimeout(timers.get(entry.target));
            timers.delete(entry.target);
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((el) => observer.observe(el));
    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, []);

  return (
    <>
      {/* Main page */}
      <Nav openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} />
      <a id="top"/>
      <Hero openPage={openPage} />
      <Compare />
      <Metrics />
      <Flow />
<Cases />
      <Pricing openPage={openPage} openPlanPayment={openPlanPayment} />
      <GuidePage openPage={openPage} />
      <Footer />

      {/* Chatbot FAB + Widget */}
      <ChatbotWidget />

      {/* ── Page Overlays ── */}

      {/* Login */}
      <PageOverlay id="login" activePage={page} onBack={closePage}>
        <LoginPage openPage={openPage} closePage={closePage} onLogin={handleLogin} />
      </PageOverlay>

      {/* Signup */}
      <div className={`page-overlay${page === 'signup' ? ' active' : ''}`}>
        <div className="po-nav signup-po-nav">
          <BrandLogo onClick={closePage} />
        </div>
        <SignupPage openPage={openPage} />
      </div>

      {/* Mypage */}
      <div className={`page-overlay${page === 'mypage' ? ' active' : ''}`}>
        <div className="po-nav">
          <BrandLogo onClick={closePage} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--ink-soft)', display: 'flex', alignItems: 'center' }}>홍길동님</span>
            <button className="pg-btn" style={{ fontSize: 13, padding: '7px 14px' }} onClick={handleLogout}>로그아웃</button>
          </div>
        </div>
        <div className="po-body">
          <MypagePage key={mypageKey} openPage={openPage} closePage={closePage} initialTab={mypageTab} />
        </div>
      </div>

      {/* Payment (ticketing) */}
      <div className={`page-overlay${page === 'payment' ? ' active' : ''}`}>
        <div className="po-nav">
          <button className="po-back" onClick={closePage}>← CAPTCHA로</button>
          <span className="po-title">TICKETING · CHECKOUT</span>
          <button className="pg-btn" style={{ marginLeft: 'auto', fontSize: 13, padding: '7px 14px' }}>주문 취소</button>
        </div>
        <PaymentPage closePage={closePage} />
      </div>

      {/* Board */}
      <div className={`page-overlay${page === 'board' ? ' active' : ''}`}>
        {!boardDetailOpen && (
          <div className="po-nav">
            <BrandLogo onClick={closePage} />
          </div>
        )}
        <BoardPage
          closePage={closePage}
          openPage={openPage}
          onDetailChange={setBoardDetailOpen}
          isLoggedIn={isLoggedIn}
          onLogout={handleLogout}
        />
      </div>

      {/* Enterprise Inquiry */}
      <div className={`page-overlay${page === 'enterprise' ? ' active' : ''}`}>
        <div className="po-nav">
          <BrandLogo onClick={closePage} />
        </div>
        <EnterprisePage closePage={closePage} />
      </div>

      {/* Plan Payment */}
      <div className={`page-overlay${page === 'plan-pay' ? ' active' : ''}`}>
        <div className="po-nav">
          <BrandLogo onClick={closePage} />
          <div style={{ marginLeft: 'auto' }}>
            <span style={{ fontSize: 11, background: 'var(--peach)', color: 'var(--orange-2)', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>TEST MODE · 실제 결제 없음</span>
          </div>
        </div>
        <PlanPayPage planName={planPayArgs.plan} closePage={closePage} openPage={openPage} openMypageOnApiKey={openMypageOnApiKey} />
      </div>
    </>
  );
}
