import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { session } from '@/lib/auth/session';
import { authApi } from '@/lib/api/auth';
import type { AuthUser, LoginCredentials } from '@/types';

interface AuthState {
  user:          AuthUser | null;
  isLoading:     boolean;
  error:         string | null;
  isAuthenticated: boolean;

  login:  (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  hydrate:() => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      isLoading:       false,
      error:           null,
      isAuthenticated: false,

      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authApi.login(credentials);
          session.save(data);
          set({ user: data.user, isAuthenticated: true, isLoading: false });
        } catch (err: unknown) {
          const message =
            (err as { response?: { data?: { detail?: string } } })
              ?.response?.data?.detail ?? 'Login failed.';
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        // Always clear local session regardless of API response
        try {
          const refresh = session.getRefreshToken();
          if (refresh) {
            try {
              await authApi.logout(refresh);
            } catch {
              // Token already blacklisted or invalid — ignore and proceed
            }
          }
        } finally {
          session.clear();
          set({ user: null, isAuthenticated: false });
        }
      },

      hydrate: () => {
        const user = session.getUser();
        if (user && session.isAuthenticated()) {
          set({ user, isAuthenticated: true });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name:    'crm-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : {
          getItem:    () => null,
          setItem:    () => {},
          removeItem: () => {},
        }
      ),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
