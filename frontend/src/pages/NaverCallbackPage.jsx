import React, { useEffect, useState } from 'react';
import api from '../api/axios';

let pendingCallbackKey = null;
let pendingCallbackRequest = null;

function exchangeNaverCode(code, state) {
  const callbackKey = `${code}:${state}`;
  if (pendingCallbackKey !== callbackKey || !pendingCallbackRequest) {
    pendingCallbackKey = callbackKey;
    pendingCallbackRequest = api.post('/auth/naver/callback', { code, state });
  }
  return pendingCallbackRequest;
}

export default function NaverCallbackPage({ onLogin }) {
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const naverError = params.get('error_description') || params.get('error');
    const expectedState = sessionStorage.getItem('naver_oauth_state');

    if (naverError) {
      // 사용자가 네이버 화면에서 취소한 경우 — 에러 화면 없이 로그인 창으로 복귀
      sessionStorage.removeItem('naver_oauth_state');
      sessionStorage.setItem('reopen_login', '1');
      window.location.replace('/');
      return;
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      sessionStorage.removeItem('naver_oauth_state');
      setError('네이버 로그인 요청을 확인할 수 없습니다. 다시 시도해 주세요.');
      return;
    }

    let active = true;
    exchangeNaverCode(code, state)
      .then(({ data }) => {
        if (!active) return;
        sessionStorage.removeItem('naver_oauth_state');
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.history.replaceState({}, '', '/');
        onLogin(data.user);
      })
      .catch((err) => {
        if (!active) return;
        sessionStorage.removeItem('naver_oauth_state');
        setError(err.response?.data?.detail || '네이버 로그인 처리 중 오류가 발생했습니다.');
      });

    return () => { active = false; };
  }, [onLogin]);

  const goHome = () => {
    window.location.assign('/');
  };

  return (
    <main className="po-body" style={{ maxWidth: 480, minHeight: '100vh', justifyContent: 'center' }}>
      <h1 className="pg-h1">네이버 로그인</h1>
      {error ? (
        <>
          <p style={{ color: '#c0392b', textAlign: 'center' }}>{error}</p>
          <button type="button" className="pg-btn primary" onClick={goHome}>
            처음으로 돌아가기
          </button>
        </>
      ) : (
        <p style={{ color: 'var(--ink-soft)', textAlign: 'center' }}>
          네이버 계정을 확인하고 있습니다...
        </p>
      )}
    </main>
  );
}
