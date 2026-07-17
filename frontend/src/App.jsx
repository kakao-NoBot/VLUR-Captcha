// App.jsx

import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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

// Pages
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import MypagePage from './pages/MypagePage';
import PaymentPage from './pages/PaymentPage';
import GuidePage from './pages/GuidePage';
import BoardPage from './pages/BoardPage';
import PlanPayPage from './pages/PlanPayPage';
import EnterprisePage from './pages/EnterprisePage';
import ApplyPage from './pages/ApplyPage';
import ApplyDonePage from './pages/ApplyDonePage';
import KakaoCallbackPage from './pages/KakaoCallbackPage';
import AdminPage from './pages/AdminPage';
import NaverCallbackPage from './pages/NaverCallbackPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import KakaoPayCallbackPage from './pages/KakaoPayCallbackPage';
import TossPayCallbackPage from './pages/TossPayCallbackPage';

const PAGE_PATHS = {
  login: '/login',
  signup: '/signup',
  mypage: '/mypage',
  payment: '/payment',
  guide: '/guide',
  board: '/board',
  enterprise: '/enterprise',
  admin: '/admin',
  'plan-pay': '/plan-pay',
  apply: '/apply',
  'apply-done': '/apply-done',
};

function PageShell({ onBack, openPage, isLoggedIn, onLogout, user, children }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="page-overlay active">
      <Nav embedded openPage={openPage} isLoggedIn={isLoggedIn} onLogout={onLogout} onHome={onBack} user={user} />
      {children}
    </div>
  );
}

function ProtectedRoute({ allowed, children }) {
  return allowed ? children : <Navigate to="/login" replace />;
}

function HomePage({ openPage, isLoggedIn, onLogout, user, openPlanPayment, planRefreshKey }) {
  return (
    <>
      <Nav openPage={openPage} isLoggedIn={isLoggedIn} onLogout={onLogout} user={user} />
      <a id="top" />
      <Hero openPage={openPage} />
      <Compare />
      <Metrics />
      <Flow />
      <Cases />
      <Pricing openPage={openPage} openPlanPayment={openPlanPayment} isLoggedIn={isLoggedIn} planRefreshKey={planRefreshKey} />
      <GuidePage openPage={openPage} />
      <Footer />
      <ChatbotWidget />
    </>
  );
}

function readCompletedPayment() {
  try {
    const stored = sessionStorage.getItem('completed_payment');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function readCancelledPayment() {
  try {
    const stored = sessionStorage.getItem('cancelled_payment');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// 소셜 로그인 취소 후 돌아온 경우 — 로그인 페이지를 자동으로 다시 연다.
function readReopenLogin() {
  try {
    if (!sessionStorage.getItem('reopen_login')) return false;
    sessionStorage.removeItem('reopen_login');
    return true;
  } catch {
    return false;
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [completedPayment] = useState(readCompletedPayment);
  const [cancelledPayment] = useState(readCancelledPayment);
  const [reopenLogin] = useState(readReopenLogin);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(Boolean(cancelledPayment));
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
  const [pendingPlan, setPendingPlan] = useState(null);
  const [planRefreshKey, setPlanRefreshKey] = useState(0);

  useEffect(() => {
    if (completedPayment) sessionStorage.removeItem('completed_payment');
  }, [completedPayment]);

  useEffect(() => {
    if (cancelledPayment) sessionStorage.removeItem('cancelled_payment');
  }, [cancelledPayment]);

  // 외부 결제·소셜 로그인에서 루트로 돌아온 직후에도 이전 흐름을 URL로 복원한다.
  useEffect(() => {
    if (location.pathname !== '/') return;
    if (completedPayment || cancelledPayment) {
      navigate('/plan-pay', { replace: true });
    } else if (reopenLogin) {
      navigate('/login', { replace: true });
    }
  }, [cancelledPayment, completedPayment, location.pathname, navigate, reopenLogin]);

  const openPage = (id) => {
    const targetPath = PAGE_PATHS[id];
    if (!targetPath) return;

    if (id === 'admin' && currentUser?.role !== 'admin') {
      navigate('/login');
      return;
    }
    if (id === 'mypage') {
      setMypageTab('info');
      setMypageKey((key) => key + 1);
    }
    if (id === 'signup') setSignupKey((key) => key + 1);
    if (id === 'board') setBoardKey((key) => key + 1);
    navigate(targetPath);
  };

  const closePage = () => {
    setPendingPlan(null);
    setPlanRefreshKey((key) => key + 1);
    navigate('/');
  };

  const handleLogin = (user) => {
    setIsLoggedIn(true);
    setCurrentUser(user);
    if (pendingPlan) {
      setPlanPayArgs({ plan: pendingPlan, completed: false });
      setPendingPlan(null);
      navigate('/plan-pay', { replace: true });
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
      navigate('/login');
      return;
    }
    setPlanPayArgs({ plan, completed: false });
    navigate('/plan-pay');
  };

  const openMypageOnApiKey = () => {
    setMypageTab('apikey');
    setMypageKey((key) => key + 1);
    navigate('/mypage');
  };

  // 홈이 다시 렌더링될 때 스크롤 애니메이션 대상을 새로 연결한다.
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return undefined;
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
            clearTimeout(timers.get(entry.target));
            timers.delete(entry.target);
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    els.forEach((element) => observer.observe(element));
    return () => { observer.disconnect(); timers.forEach(clearTimeout); };
  }, [location.pathname]);

  const pageShellProps = {
    onBack: closePage,
    openPage,
    isLoggedIn,
    onLogout: handleLogout,
    user: currentUser,
  };

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={(
            <HomePage
              openPage={openPage}
              isLoggedIn={isLoggedIn}
              onLogout={handleLogout}
              user={currentUser}
              openPlanPayment={openPlanPayment}
              planRefreshKey={planRefreshKey}
            />
          )}
        />
        <Route path="/auth/kakao/callback" element={<KakaoCallbackPage onLogin={handleLogin} />} />
        <Route path="/auth/naver/callback" element={<NaverCallbackPage onLogin={handleLogin} />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage onLogin={handleLogin} />} />
        <Route path="/payments/kakao/*" element={<KakaoPayCallbackPage />} />
        <Route path="/payments/toss/*" element={<TossPayCallbackPage />} />

        <Route path="/login" element={<PageShell {...pageShellProps}><LoginPage openPage={openPage} closePage={closePage} onLogin={handleLogin} /></PageShell>} />
        <Route path="/signup" element={<PageShell {...pageShellProps}><SignupPage key={signupKey} openPage={openPage} onLogin={handleLogin} /></PageShell>} />
        <Route path="/guide" element={<PageShell {...pageShellProps}><GuidePage openPage={openPage} /></PageShell>} />
        <Route path="/board" element={<PageShell {...pageShellProps}><BoardPage key={boardKey} user={currentUser} /></PageShell>} />
        <Route path="/board/notice/:postId" element={<PageShell {...pageShellProps}><BoardPage key={boardKey} user={currentUser} detailType="notice" /></PageShell>} />
        <Route path="/board/research/:postId" element={<PageShell {...pageShellProps}><BoardPage key={boardKey} user={currentUser} detailType="research" /></PageShell>} />
        <Route path="/board/:boardType/:postId" element={<Navigate to="/board" replace />} />
        <Route path="/enterprise" element={<PageShell {...pageShellProps}><EnterprisePage closePage={closePage} /></PageShell>} />
        <Route path="/apply" element={<PageShell {...pageShellProps}><ApplyPage openPage={openPage} /></PageShell>} />
        <Route path="/apply-done" element={<ProtectedRoute allowed={isLoggedIn}><PageShell {...pageShellProps}><ApplyDonePage openPage={openPage} closePage={closePage} /></PageShell></ProtectedRoute>} />
        <Route path="/payment" element={<PageShell {...pageShellProps}><PaymentPage closePage={closePage} /></PageShell>} />
        <Route
          path="/mypage"
          element={<ProtectedRoute allowed={isLoggedIn}><PageShell {...pageShellProps}><div className="po-body mp-po-body"><MypagePage key={mypageKey} openPage={openPage} closePage={closePage} initialTab={mypageTab} user={currentUser} onUserUpdate={handleUserUpdate} onLogout={handleLogout} /></div></PageShell></ProtectedRoute>}
        />
        <Route
          path="/admin"
          element={<ProtectedRoute allowed={currentUser?.role === 'admin'}><PageShell {...pageShellProps}><AdminPage /></PageShell></ProtectedRoute>}
        />
        <Route
          path="/plan-pay"
          element={<ProtectedRoute allowed={isLoggedIn}><PageShell {...pageShellProps}><PlanPayPage planName={planPayArgs.plan} initialSuccess={planPayArgs.completed} closePage={closePage} openPage={openPage} openMypageOnApiKey={openMypageOnApiKey} user={currentUser} /></PageShell></ProtectedRoute>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <PaymentCancelModal
        open={isCancelModalOpen}
        message={cancelledPayment?.message}
        onClose={() => setIsCancelModalOpen(false)}
      />
    </>
  );
}
