import api from './axios';

export type ActionType =
  | 'no_action'
  | 'create_followup'
  | 'create_lead'
  | 'create_ticket'
  | 'change_lead_stage'
  | 'mark_won'
  | 'escalate';

export type Direction = 'inbound' | 'outbound' | 'both';

export interface DispositionAction {
  id:          string;
  action_type: ActionType;
  config:      Record<string, unknown>;
  order:       number;
}

export interface Disposition {
  id:            string;
  name:          string;
  code:          string;
  color:         string;
  direction:     Direction;
  requires_note: boolean;
  is_active:     boolean;
  order:         number;
  actions:       DispositionAction[];
}

export const dispositionsApi = {
  // قائمة الـ dispositions — مع فلتر على الـ direction
  list: (params?: { direction?: Direction; is_active?: boolean }) =>
    api.get<Disposition[]>('/calls/dispositions-crud/', { params }),

  get: (id: string) =>
    api.get<Disposition>(`/calls/dispositions-crud/${id}/`),

  create: (data: Partial<Omit<Disposition, 'id' | 'actions'>>) =>
    api.post<Disposition>('/calls/dispositions-crud/', data),

  update: (id: string, data: Partial<Omit<Disposition, 'id' | 'actions'>>) =>
    api.patch<Disposition>(`/calls/dispositions-crud/${id}/`, data),

  delete: (id: string) =>
    api.delete(`/calls/dispositions-crud/${id}/`),

  // Actions CRUD
  addAction: (data: { disposition: string; action_type: ActionType; config?: Record<string, unknown>; order?: number }) =>
    api.post<DispositionAction>('/calls/disposition-actions/', data),

  updateAction: (id: string, data: Partial<{ action_type: ActionType; config: Record<string, unknown>; order: number }>) =>
    api.patch<DispositionAction>(`/calls/disposition-actions/${id}/`, data),

  deleteAction: (id: string) =>
    api.delete(`/calls/disposition-actions/${id}/`),
};
