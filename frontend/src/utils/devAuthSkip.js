// 개발 모드 강제 로그아웃(App.jsx의 clearDevAuthState)이
// 결제/로그인 콜백 페이지가 스스로 홈('/')으로 다시 이동시키는 순간까지
// 로그인 토큰을 지워버리는 것을 막기 위한 1회성 스킵 플래그.
const SKIP_KEY = 'dev_skip_next_logout_clear';

export function markSkipNextDevLogoutClear() {
  try {
    sessionStorage.setItem(SKIP_KEY, '1');
  } catch {
    // sessionStorage 접근 실패는 무시 — 최악의 경우 개발 모드에서만 재로그인 필요
  }
}

export function consumeSkipNextDevLogoutClear() {
  try {
    if (sessionStorage.getItem(SKIP_KEY) !== '1') return false;
    sessionStorage.removeItem(SKIP_KEY);
    return true;
  } catch {
    return false;
  }
}
