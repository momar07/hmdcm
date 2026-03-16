import api from './axios';
import type { Followup, PaginatedResponse } from '@/types';

export const followupsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Followup>>('/followups/', { params }),

  get: (id: string) =>
    api.get<Followup>(`/followups/${id}/`),

  create: (data: Partial<Followup>) =>
    api.post<Followup>('/followups/', data),

  update: (id: string, data: Partial<Followup>) =>
    api.patch<Followup>(`/followups/${id}/`, data),

  complete: (id: string) =>
    api.post(`/followups/${id}/complete/`),

  delete: (id: string) =>
    api.delete(`/followups/${id}/`),
};
