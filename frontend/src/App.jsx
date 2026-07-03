// App.jsx

import React, { useState, useEffect } from 'react';
import './styles/main.css';

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

// Page overlay wrapper
function PageOverlay({ id, activePage, onBack, openPage, isLoggedIn, onLogout, user, children }) {
  const isActive = activePage === id;

  useEffect(() => {
    if (isActive) window.scrollTo(0, 0);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div className="page-overlay active">
      <Nav embedded openPage={openPage} isLoggedIn={isLoggedIn} onLogout={onLogout} onHome={onBack} user={user} />
      {children}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(null);
  const [planPayArgs, setPlanPayArgs] = useState({ plan: 'Pro' });
  const [mypageTab, setMypageTab] = useState('info');
  const [mypageKey, setMypageKey] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('access_token'));
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });

  const openPage = (id) => {
  if (id === 'mypage') {
    setMypageTab('info');
    setMypageKey(k => k + 1);
  }
  setPage(id);
};
  const closePage = () => {
    setPage(null);
  };
  const handleLogin = (user) => {
    setIsLoggedIn(true);
    setCurrentUser(user);
    closePage();
  };
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    setCurrentUser(null);
    closePage();
  };

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
      <Nav openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser} />
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
      <PageOverlay id="login" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <LoginPage openPage={openPage} closePage={closePage} onLogin={handleLogin} />
      </PageOverlay>

      {/* Signup */}
      <PageOverlay id="signup" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <SignupPage openPage={openPage} onLogin={handleLogin} />
      </PageOverlay>

      {/* Mypage */}
      <PageOverlay id="mypage" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <div className="po-body">
          <MypagePage key={mypageKey} openPage={openPage} closePage={closePage} initialTab={mypageTab} user={currentUser} />
        </div>
      </PageOverlay>

      {/* Payment (ticketing) */}
      <PageOverlay id="payment" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <PaymentPage closePage={closePage} />
      </PageOverlay>

      {/* Board */}
      <PageOverlay id="board" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <BoardPage />
      </PageOverlay>

      {/* Enterprise Inquiry */}
      <PageOverlay id="enterprise" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <EnterprisePage closePage={closePage} />
      </PageOverlay>

      {/* Plan Payment */}
      <PageOverlay id="plan-pay" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <PlanPayPage planName={planPayArgs.plan} closePage={closePage} openPage={openPage} openMypageOnApiKey={openMypageOnApiKey} />
      </PageOverlay>
    </>
  );
}
