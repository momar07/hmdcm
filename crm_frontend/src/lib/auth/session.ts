import Cookies from 'js-cookie';
import type { AuthUser, AuthTokens } from '@/types';

const ACCESS_KEY  = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY    = 'crm_user';

export const session = {
  save(tokens: AuthTokens) {
    Cookies.set(ACCESS_KEY,  tokens.access,  { expires: 1,  secure: true, sameSite: 'lax' });
    Cookies.set(REFRESH_KEY, tokens.refresh, { expires: 7,  secure: true, sameSite: 'lax' });
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
    }
  },

  clear() {
    Cookies.remove(ACCESS_KEY);
    Cookies.remove(REFRESH_KEY);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_KEY);
    }
  },

  getAccessToken(): string | undefined {
    return Cookies.get(ACCESS_KEY);
  },

  getRefreshToken(): string | undefined {
    return Cookies.get(REFRESH_KEY);
  },

  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  },

  isAuthenticated(): boolean {
    return !!Cookies.get(ACCESS_KEY);
  },
};
