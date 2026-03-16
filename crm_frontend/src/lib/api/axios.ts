import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('access_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status    = err?.response?.status;
    const url       = err?.config?.url ?? '';
    const isLogin   = url.includes('/auth/login');
    const isRefresh = url.includes('/auth/refresh');

    if (status === 401 && !isLogin && !isRefresh) {
      const refreshToken = Cookies.get('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${API_URL}/api/auth/refresh/`, {
            refresh: refreshToken,
          });
          const newToken = res.data.access;
          Cookies.set('access_token', newToken, { expires: 1 });
          err.config.headers['Authorization'] = `Bearer ${newToken}`;
          return api.request(err.config);
        } catch {
          Cookies.remove('access_token');
          Cookies.remove('refresh_token');
          localStorage.removeItem('crm_user');
          if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
      } else {
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
