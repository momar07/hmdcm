import api from './axios';
import type { User, Team, PaginatedResponse } from '@/types';

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<User>>('/users/', { params }),

  get: (id: string) =>
    api.get<User>(`/users/${id}/`),

  create: (data: Partial<User> & { password: string }) =>
    api.post<User>('/users/', data),

  update: (id: string, data: Partial<User>) =>
    api.patch<User>(`/users/${id}/`, data),

  resetPassword: (id: string, password: string) =>
    api.post(`/users/${id}/reset-password/`, { new_password: password }),

  setExtension: (id: string, number: string, vicidial?: {
    vicidial_user?:     string;
    vicidial_pass?:     string;
    vicidial_campaign?: string;
    vicidial_ingroup?:  string;
  }) =>
    api.post(`/users/${id}/set-extension/`, { number, ...vicidial }),

  delete: (id: string) =>
    api.delete(`/users/${id}/`),

  setStatus: (id: string, status: string) =>
    api.patch(`/users/${id}/status/`, { status }),

  teams: {
    list:   ()                          => api.get<{ count: number; results: Team[] }>('/teams/'),
    get:    (id: string)                => api.get<Team>(`/teams/${id}/`),
    create: (data: Partial<Team>)       => api.post<Team>('/teams/', data),
    update: (id: string, data: Partial<Team>) => api.patch<Team>(`/teams/${id}/`, data),
    delete: (id: string)                => api.delete(`/teams/${id}/`),
  },
};

// ── Queue / Agent Status ──────────────────────────────────────
export const agentStatusApi = {
  get:  ()                                                    => api.get('/users/me/queue-status/'),
  set:  (action: 'login'|'open_session'|'pause'|'logoff', reason = 'Break') => api.post('/users/me/queue-status/', { action, reason }),
  live: ()                                                    => api.get('/users/live-agents/'),
};
