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
};
