import React, { useEffect, useState } from 'react';
import api from '../api/axios';

let pendingCallbackCode = null;
let pendingCallbackRequest = null;

function exchangeKakaoCode(code) {
  if (pendingCallbackCode !== code || !pendingCallbackRequest) {
    pendingCallbackCode = code;
    pendingCallbackRequest = api.post('/auth/kakao/callback', { code });
  }
  return pendingCallbackRequest;
}

export default function KakaoCallbackPage({ onLogin }) {
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const kakaoError = params.get('error_description') || params.get('error');
    const expectedState = sessionStorage.getItem('kakao_oauth_state');

    if (kakaoError) {
      sessionStorage.removeItem('kakao_oauth_state');
      setError(`카카오 로그인이 취소되었습니다. (${kakaoError})`);
      return;
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      sessionStorage.removeItem('kakao_oauth_state');
      setError('카카오 로그인 요청을 확인할 수 없습니다. 다시 시도해 주세요.');
      return;
    }

    let active = true;
    exchangeKakaoCode(code)
      .then(({ data }) => {
        if (!active) return;
        sessionStorage.removeItem('kakao_oauth_state');
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.history.replaceState({}, '', '/');
        onLogin(data.user);
      })
      .catch((err) => {
        if (!active) return;
        sessionStorage.removeItem('kakao_oauth_state');
        setError(err.response?.data?.detail || '카카오 로그인 처리 중 오류가 발생했습니다.');
      });

    return () => { active = false; };
  }, [onLogin]);

  const goHome = () => {
    window.location.assign('/');
  };

  return (
    <main className="po-body" style={{ maxWidth: 480, minHeight: '100vh', justifyContent: 'center' }}>
      <h1 className="pg-h1">카카오 로그인</h1>
      {error ? (
        <>
          <p style={{ color: '#c0392b', textAlign: 'center' }}>{error}</p>
          <button type="button" className="pg-btn primary" onClick={goHome}>
            처음으로 돌아가기
          </button>
        </>
      ) : (
        <p style={{ color: 'var(--ink-soft)', textAlign: 'center' }}>
          카카오 계정을 확인하고 있습니다...
        </p>
      )}
    </main>
  );
}
