import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const AUTH_UNAUTHORIZED_EVENT = 'vlur:auth-unauthorized';

// 요청마다 localStorage 토큰을 Authorization 헤더에 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 저장된 JWT가 만료되거나 서버의 서명 키가 바뀐 경우 stale 로그인 상태를 정리한다.
// 같은 토큰으로 동시에 보낸 여러 요청이 모두 401이어도 이벤트는 한 번만 발생한다.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const storedToken = localStorage.getItem('access_token');
    const authorization = (
      error.config?.headers?.Authorization
      ?? error.config?.headers?.get?.('Authorization')
    );
    const isCurrentSessionUnauthorized = (
      error.response?.status === 401
      && storedToken
      && authorization === `Bearer ${storedToken}`
    );

    if (isCurrentSessionUnauthorized) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }

    return Promise.reject(error);
  }
);

export default api;
