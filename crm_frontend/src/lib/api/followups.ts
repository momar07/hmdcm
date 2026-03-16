import api from './axios';
import type { Followup, PaginatedResponse } from '@/types';

export const followupsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Followup>>('/followups/', { params }),

  get: (id: string) =>
    api.get<Followup>(`/followups/${id}/`),

  create: (data: Partial<Followup> & { customer_id?: string; scheduled_at: string }) =>
    api.post<Followup>('/followups/', data),

  update: (id: string, data: Partial<Followup>) =>
    api.patch<Followup>(`/followups/${id}/`, data),

  complete: (id: string) =>
    api.post(`/followups/${id}/complete/`),

  cancel: (id: string) =>
    api.post(`/followups/${id}/cancel/`),

  reschedule: (id: string, scheduled_at: string) =>
    api.post(`/followups/${id}/reschedule/`, { scheduled_at }),

  upcoming: () =>
    api.get<Followup[]>('/followups/upcoming/'),

  overdue: () =>
    api.get<Followup[]>('/followups/overdue/'),

  delete: (id: string) =>
    api.delete(`/followups/${id}/`),
};
