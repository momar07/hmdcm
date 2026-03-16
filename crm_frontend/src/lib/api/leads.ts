import api from './axios';
import type { Lead, LeadStatus, LeadPriority, PaginatedResponse } from '@/types';

export const leadsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Lead>>('/leads/', { params }),

  get: (id: string) =>
    api.get<Lead>(`/leads/${id}/`),

  create: (data: Partial<Lead>) =>
    api.post<Lead>('/leads/', data),

  update: (id: string, data: Partial<Lead>) =>
    api.patch<Lead>(`/leads/${id}/`, data),

  delete: (id: string) =>
    api.delete(`/leads/${id}/`),

  assign: (id: string, agent_id: string) =>
    api.patch(`/leads/${id}/assign/`, { agent_id }),

  changeStatus: (id: string, status_id: string) =>
    api.patch(`/leads/${id}/status/`, { status_id }),

  statuses: () =>
    api.get<LeadStatus[]>('/leads/statuses/'),

  priorities: () =>
    api.get<LeadPriority[]>('/leads/priorities/'),
};
