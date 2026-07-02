import React, { useEffect, useState } from 'react';
import vlurLogo from '../assets/vlur-logo-transparent-hq-2x.png';

const DESKTOP_SECTION_LINKS = [
  { label: '차별성', target: 'compare' },
  { label: '성능', target: 'metrics' },
  { label: '검증 절차', target: 'flow' },
  { label: '사용 사례', target: 'cases' },
  { label: '가이드', target: 'guide' },
];

export default function Nav({ openPage, isLoggedIn, onLogout }) {
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const handleSectionClick = (event, target) => {
    event.preventDefault();
    document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
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
    <header className="site-header">
      <div className="wrap nav">
        <a className="brand" href="#top" aria-label="VLUR 홈" onClick={closeMobileMenu}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--line)', borderRadius: 8, width: 38, height: 38, flexShrink: 0 }}>
            <img src={vlurLogo} alt="VLUR" style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }} />
          </div>
          <span style={{ fontFamily: 'var(--disp)', fontWeight: 800, fontSize: 16, letterSpacing: '-.01em', color: 'var(--ink)' }}>
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
              <a className="btn btn-ghost" href="#" onClick={e => { e.preventDefault(); openPage('mypage'); }} style={{ textDecoration: 'underline', color: 'var(--ink-soft)' }}>홍길동님</a>
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
            aria-controls="mobile-home-menu"
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
        id="mobile-home-menu"
      >
        <a href="#faq" onClick={handleNoticeClick}>공지사항</a>
        <a href="#login" onClick={(event) => handleMobilePageClick(event, 'login')}>로그인</a>
      </div>
    </header>
  );
}
