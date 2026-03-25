import api from './axios';
import type { Call, Disposition, PaginatedResponse } from '@/types';

export interface CallCompletionPayload {
  disposition_id:        string;
  note:                  string;
  next_action:           'callback' | 'send_quotation' | 'followup_later' | 'close_lead' | 'no_action';
  update_lead_stage?:    boolean;
  new_lead_stage_id?:    string;
  won_amount?:           number | null;
  lost_reason?:          string;
  followup_required?:    boolean;
  followup_due_at?:      string;
  followup_type?:        string;
  followup_assigned_to?: string;
}

export const callsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Call>>('/calls/', { params }),

  get: (id: string) =>
    api.get<Call>(`/calls/${id}/`),

  originate: (data: { phone_number: string; customer_id?: string; lead_id?: string }) =>
    api.post('/calls/originate/', data),

  screenPop: (phone: string) =>
    api.get('/calls/screen-pop/', { params: { phone } }),

  complete: (callId: string, data: CallCompletionPayload) =>
    api.post(`/calls/complete/${callId}/`, data),

  pendingCompletions: () =>
    api.get<Call[]>('/calls/pending-completions/'),

  dispositionsList: () =>
    api.get<Disposition[]>('/calls/dispositions-list/'),

  leadStages: () =>
    api.get('/leads/stages/'),

  addDisposition: (callId: string, data: { disposition_id: string; notes?: string }) =>
    api.post(`/calls/${callId}/add_disposition/`, data),

  dispositions: () =>
    api.get<Disposition[]>('/calls/dispositions/'),

  linkCall: (uniqueid: string, customer_id: string) =>
    api.post('/calls/link-call/', { uniqueid, customer_id }),

  // WebRTC call tracking
  startWebrtcCall: (data: {
    customer_phone: string;
    customer_id?:   string | null;
    lead_id?:       string | null;
    followup_id?:   string | null;
  }) => api.post<{ call_id: string; caller: string; callee: string; customer_id: string | null }>('/calls/start-webrtc-call/', data),

  endWebrtcCall: (call_id: string, data: {
    end_cause: string;
    duration?: number;
  }) => api.patch(`/calls/end-webrtc-call/${call_id}/`, data),
};

// ── Disposition CRUD types ────────────────────────────────────────────────────

export type DispositionDirection = 'inbound' | 'outbound' | 'both';

export type DispositionActionType =
  | 'no_action'
  | 'create_followup'
  | 'create_lead'
  | 'create_ticket'
  | 'change_lead_stage'
  | 'mark_won'
  | 'escalate';

export interface DispositionAction {
  id: string;
  disposition: string;
  action_type: DispositionActionType;
  config: Record<string, unknown>;
  order: number;
}

export interface DispositionFull {
  id: string;
  name: string;
  code: string;
  direction: DispositionDirection;
  color: string;
  requires_note: boolean;
  is_active: boolean;
  order: number;
  actions: DispositionAction[];
}

// ── Disposition CRUD API ──────────────────────────────────────────────────────

export const fetchDispositions = (direction?: DispositionDirection): Promise<DispositionFull[]> =>
  api.get('/calls/dispositions-crud/', { params: direction ? { direction } : {} })
     .then(r => Array.isArray(r.data) ? r.data : r.data.results ?? []);

export const fetchDispositionActions = (dispositionId: string): Promise<DispositionAction[]> =>
  api.get('/calls/disposition-actions/', { params: { disposition: dispositionId } })
     .then(r => Array.isArray(r.data) ? r.data : r.data.results ?? []);

export const saveDisposition = (
  data: Partial<DispositionFull> & { name: string; direction: DispositionDirection },
  id?: string
): Promise<DispositionFull> =>
  id
    ? api.patch(`/calls/dispositions-crud/${id}/`, data).then(r => r.data)
    : api.post('/calls/dispositions-crud/', data).then(r => r.data);

export const deleteDisposition = (id: string): Promise<void> =>
  api.delete(`/calls/dispositions-crud/${id}/`).then(() => undefined);

export const saveDispositionAction = (
  data: Partial<DispositionAction> & { disposition: string; action_type: DispositionActionType },
  id?: string
): Promise<DispositionAction> =>
  id
    ? api.patch(`/calls/disposition-actions/${id}/`, data).then(r => r.data)
    : api.post('/calls/disposition-actions/', data).then(r => r.data);

export const deleteDispositionAction = (id: string): Promise<void> =>
  api.delete(`/calls/disposition-actions/${id}/`).then(() => undefined);

export const updateDispositionOrder = (items: { id: string; order: number }[]): Promise<void> =>
  Promise.all(items.map(({ id, order }) =>
    api.patch(`/calls/dispositions-crud/${id}/`, { order })
  )).then(() => undefined);

export const createDisposition = saveDisposition;

