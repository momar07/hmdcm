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

  setStatus: (id: string, status: string) =>
    api.patch(`/users/${id}/status/`, { status }),

  teams: {
    list: () => api.get<Team[]>('/teams/'),
    create: (data: Partial<Team>) => api.post<Team>('/teams/', data),
    update: (id: string, data: Partial<Team>) =>
      api.patch<Team>(`/teams/${id}/`, data),
  },
};
