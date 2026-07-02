import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// 요청마다 localStorage 토큰을 Authorization 헤더에 자동 첨부
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
