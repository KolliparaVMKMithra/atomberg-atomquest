import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const isLoginPage = window.location.pathname === '/';
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      if (!isLoginPage && !isLoginRequest) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.replace('/');
      }
    }
    return Promise.reject(error);
  }
);

export default api;