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
import PaymentCancelModal from './components/PaymentCancelModal';

// Pages (overlays)
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import MypagePage from './pages/MypagePage';
import PaymentPage from './pages/PaymentPage';
import GuidePage from './pages/GuidePage';
import BoardPage from './pages/BoardPage';
import PlanPayPage from './pages/PlanPayPage';
import EnterprisePage from './pages/EnterprisePage';
import KakaoCallbackPage from './pages/KakaoCallbackPage';
import NaverCallbackPage from './pages/NaverCallbackPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import KakaoPayCallbackPage from './pages/KakaoPayCallbackPage';
import TossPayCallbackPage from './pages/TossPayCallbackPage';

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

function readCompletedPayment() {
  try {
    const stored = sessionStorage.getItem('completed_payment');
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function readCancelledPayment() {
  try {
    const stored = sessionStorage.getItem('cancelled_payment');
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export default function App() {
  const currentPath = window.location.pathname;
  const isOAuthCallback = currentPath.startsWith('/auth/') && currentPath.endsWith('/callback');
  const [completedPayment] = useState(readCompletedPayment);
  const [cancelledPayment] = useState(readCancelledPayment);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(Boolean(cancelledPayment));
  const [page, setPage] = useState(completedPayment || cancelledPayment ? 'plan-pay' : null);
  const [planPayArgs, setPlanPayArgs] = useState({
    plan: completedPayment?.plan_name || cancelledPayment?.plan_name || 'Pro',
    completed: Boolean(completedPayment),
  });
  const [mypageTab, setMypageTab] = useState('info');
  const [mypageKey, setMypageKey] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('access_token'));
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
  });
  const [signupKey, setSignupKey] = useState(0);
  const [boardKey, setBoardKey] = useState(0);
  // 비로그인 상태로 결제 진입 시 로그인 후 이어갈 요금제
  const [pendingPlan, setPendingPlan] = useState(null);

  useEffect(() => {
    if (completedPayment) {
      sessionStorage.removeItem('completed_payment');
    }
  }, [completedPayment]);

  useEffect(() => {
    if (cancelledPayment) sessionStorage.removeItem('cancelled_payment');
  }, [cancelledPayment]);

  const openPage = (id) => {
    if (id === 'mypage') {
      setMypageTab('info');
      setMypageKey(k => k + 1);
    }
    if (id === 'signup') {
      setSignupKey(k => k + 1);
    }
    if (id === 'board') {
      setBoardKey(k => k + 1);
    }
    setPage(id);
  };

  const closePage = () => {
    setPendingPlan(null);
    setPage(null);
  };
  const handleLogin = (user) => {
    setIsLoggedIn(true);
    setCurrentUser(user);
    if (pendingPlan) {
      setPlanPayArgs({ plan: pendingPlan, completed: false });
      setPendingPlan(null);
      setPage('plan-pay');
      return;
    }
    closePage();
  };
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    setCurrentUser(null);
    closePage();
  };
  const handleUserUpdate = (user) => {
    setCurrentUser(user);
    localStorage.setItem('user', JSON.stringify(user));
  };

  const openPlanPayment = (plan) => {
    if (!isLoggedIn) {
      setPendingPlan(plan);
      setPage('login');
      return;
    }
    setPlanPayArgs({ plan, completed: false });
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
  }, [isOAuthCallback]);

  if (currentPath === '/auth/kakao/callback') {
    return <KakaoCallbackPage onLogin={handleLogin} />;
  }
  if (currentPath === '/auth/naver/callback') {
    return <NaverCallbackPage onLogin={handleLogin} />;
  }
  if (currentPath === '/auth/google/callback') {
    return <GoogleCallbackPage onLogin={handleLogin} />;
  }
  if (currentPath.startsWith('/payments/kakao/')) {
    return <KakaoPayCallbackPage />;
  }
  if (currentPath.startsWith('/payments/toss/')) {
    return <TossPayCallbackPage />;
  }

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
      <PageOverlay id="signup" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout}>
        <SignupPage key={signupKey} openPage={openPage} onLogin={handleLogin} />
      </PageOverlay>

      {/* Mypage */}
      <PageOverlay id="mypage" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <div className="po-body">
          <MypagePage key={mypageKey} openPage={openPage} closePage={closePage} initialTab={mypageTab} user={currentUser} onUserUpdate={handleUserUpdate} />
        </div>
      </PageOverlay>

      {/* Payment (ticketing) */}
      <PageOverlay id="payment" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <PaymentPage closePage={closePage} />
      </PageOverlay>

      {/* Board */}
      <PageOverlay id="board" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <BoardPage key={boardKey} user={currentUser} />
      </PageOverlay>

      {/* Enterprise Inquiry */}
      <PageOverlay id="enterprise" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <EnterprisePage closePage={closePage} />
      </PageOverlay>

      {/* Plan Payment */}
      <PageOverlay id="plan-pay" activePage={page} onBack={closePage} openPage={openPage} isLoggedIn={isLoggedIn} onLogout={handleLogout} user={currentUser}>
        <PlanPayPage planName={planPayArgs.plan} initialSuccess={planPayArgs.completed} closePage={closePage} openPage={openPage} openMypageOnApiKey={openMypageOnApiKey} user={currentUser} />
      </PageOverlay>

      <PaymentCancelModal
        open={isCancelModalOpen}
        message={cancelledPayment?.message}
        onClose={() => setIsCancelModalOpen(false)}
      />
    </>
  );
}
