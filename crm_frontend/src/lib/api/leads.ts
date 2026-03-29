import api from './axios';
import type { Lead, LeadStatus, LeadPriority, LeadEvent, PaginatedResponse } from '@/types';

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

  // ── Stage CRUD (for Settings page) ──────────────────────────
  createStage: (data: { name: string; color: string; order: number; is_won?: boolean; is_closed?: boolean }) =>
    api.post('/leads/stages/', data),

  updateStage: (id: string, data: Partial<{ name: string; color: string; order: number; is_active: boolean; is_won: boolean; is_closed: boolean }>) =>
    api.patch(`/leads/stages/${id}/`, data),

  deleteStage: (id: string) =>
    api.delete(`/leads/stages/${id}/`),

  reorderStages: async (orderedIds: string[]) => {
    // PATCH each stage with its new order index
    return Promise.all(
      orderedIds.map((id, index) =>
        api.patch(`/leads/stages/${id}/`, { order: index + 1 })
      )
    );
  },

  // ── Audit trail ──────────────────────────────────────────
  events: (leadId: string) =>
    api.get<LeadEvent[]>(`/leads/${leadId}/events/`),

  // ── Follow-up date sync ──────────────────────────────────
  setFollowupDate: (leadId: string, followup_date: string | null) =>
    api.patch(`/leads/${leadId}/followup-date/`, { followup_date }),

  updateLifecycle: (leadId: string, lifecycle_stage: string) =>
    api.patch(`/leads/${leadId}/`, { lifecycle_stage }),

  scoreEvents: (leadId: string) =>
    api.get(`/leads/${leadId}/score-events/`).then((r) => r.data),
};
