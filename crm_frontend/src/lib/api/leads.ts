import api from './axios';
import type { Lead, LeadStatus, LeadPriority, PaginatedResponse } from '@/types';

const toArray = <T>(data: any): T[] => {
  if (Array.isArray(data))          return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

export const leadsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Lead>>('/leads/', { params }),

  get: (id: string) =>
    api.get<Lead>(`/leads/${id}/`),

  create: (data: Record<string, unknown>) =>
    api.post<Lead>('/leads/', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Lead>(`/leads/${id}/`, data),

  delete: (id: string) =>
    api.delete(`/leads/${id}/`),

  assign: (id: string, agent_id: string) =>
    api.patch(`/leads/${id}/assign/`, { agent_id }),

  changeStatus: (id: string, status_id: string) =>
    api.patch(`/leads/${id}/status/`, { status_id }),

  statuses: () =>
    api.get('/leads/statuses/').then((r) => ({
      ...r,
      data: toArray<LeadStatus>(r.data),
    })),

  priorities: () =>
    api.get('/leads/priorities/').then((r) => ({
      ...r,
      data: toArray<LeadPriority>(r.data),
    })),

  stages: () =>
    api.get('/leads/stages/').then((r) => ({
      ...r,
      data: toArray<any>(r.data),
    })),

  moveStage: (leadId: string, stageId: string) =>
    api.patch(`/leads/${leadId}/move-stage/`, { stage_id: stageId }),
};
