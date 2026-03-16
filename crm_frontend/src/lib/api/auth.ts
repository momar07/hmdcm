import api from './axios';
import type { AuthTokens, LoginCredentials } from '@/types';

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<AuthTokens>('/auth/login/', credentials),

  logout: (refresh: string) =>
    api.post('/auth/logout/', { refresh }),

  me: () =>
    api.get('/auth/me/'),

  changePassword: (old_password: string, new_password: string) =>
    api.post('/auth/change-password/', { old_password, new_password }),

  refreshToken: (refresh: string) =>
    api.post('/auth/token/refresh/', { refresh }),
};
