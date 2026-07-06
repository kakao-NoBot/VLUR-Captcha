import React, { useEffect, useId, useState } from 'react';
import vlurLogo from '../assets/vlur-logo-transparent-hq-2x.png';

const DESKTOP_SECTION_LINKS = [
  { label: '차별성', target: 'compare' },
  { label: '성능', target: 'metrics' },
  { label: '검증 절차', target: 'flow' },
  { label: '사용 사례', target: 'cases' },
  { label: '가이드', target: 'guide' },
];

export default function Nav({ openPage, isLoggedIn, onLogout, onHome, embedded = false, user = null }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuId = useId();
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    const handleResize = () => {
      if (window.innerWidth > 940) setMobileOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileOpen]);

  const closeMobileMenu = () => setMobileOpen(false);

  const handleHomeClick = (event) => {
    closeMobileMenu();
    if (!onHome) return;
    event.preventDefault();
    onHome();
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const handleSectionClick = (event, target) => {
    event.preventDefault();
    closeMobileMenu();
    if (onHome) onHome();
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  };

  const handleMobilePageClick = (event, page) => {
    event.preventDefault();
    closeMobileMenu();
    openPage(page);
  };

  const handleNoticeClick = (event) => {
    event.preventDefault();
    closeMobileMenu();
    openPage('board');
  };

  return (
    <header className={`site-header${embedded ? ' overlay-site-header' : ''}`}>
      <div className="wrap nav">
        <a className="brand" href="#top" aria-label="VLUR 홈" onClick={handleHomeClick}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, flexShrink: 0 }}>
            <img src={vlurLogo} alt="VLUR" style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }} />
          </div>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 18, letterSpacing: '-.01em', color: 'var(--ink)' }}>
            VLUR <span style={{ color: 'var(--orange)' }}>CAPTCHA</span>
          </span>
        </a>

        <nav className="nav-right" aria-label="주요 메뉴">
          <div className="nav-links">
            {DESKTOP_SECTION_LINKS.map((item) => (
              <a
                key={item.target}
                href={`#${item.target}`}
                onClick={(event) => handleSectionClick(event, item.target)}
              >
                {item.label}
              </a>
            ))}
            <a href="#faq" onClick={handleNoticeClick}>공지사항</a>
          </div>
          <div className="nav-auth">
            {isLoggedIn ? (
              <>
              <a
                className="btn btn-ghost"
                href="#"
                onClick={e => {
                  e.preventDefault();
                  openPage(isAdmin ? 'admin' : 'mypage');
                }}
                style={{ textDecoration: 'underline', color: 'var(--ink-soft)' }}
              >
                {isAdmin ? '관리자 페이지' : `${user?.user_name || ''}님`}
              </a>
              <a className="btn btn-outline" href="#" onClick={e => { e.preventDefault(); onLogout(); }} style={{ padding: '7px 13px', fontSize: 13.5 }}>로그아웃</a>
              </>
            ) : (
              <>
              <a className="btn btn-ghost" href="#" onClick={e => { e.preventDefault(); openPage('login'); }}>로그인</a>
              <a className="btn btn-primary" href="#" onClick={e => { e.preventDefault(); openPage('signup'); }}>회원가입</a>
              </>
            )}
          </div>
          <button
            className={`menu-toggle${mobileOpen ? ' open' : ''}`}
            type="button"
            aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            onClick={() => setMobileOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </nav>
      </div>
      <div
        className={`mobile-menu${mobileOpen ? ' open' : ''}`}
        id={mobileMenuId}
      >
        <a href="#faq" onClick={handleNoticeClick}>공지사항</a>
        {isLoggedIn ? (
          <>
            <a href={isAdmin ? '#admin' : '#mypage'} onClick={(event) => handleMobilePageClick(event, isAdmin ? 'admin' : 'mypage')}>
              {isAdmin ? '관리자 페이지' : '마이페이지'}
            </a>
            <a href="#logout" onClick={(event) => { event.preventDefault(); closeMobileMenu(); onLogout(); }}>로그아웃</a>
          </>
        ) : (
          <>
            <a href="#login" onClick={(event) => handleMobilePageClick(event, 'login')}>로그인</a>
            <a href="#signup" onClick={(event) => handleMobilePageClick(event, 'signup')}>회원가입</a>
          </>
        )}
      </div>
    </header>
  );
}
