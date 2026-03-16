import api from './axios';
import type { Call, Disposition, PaginatedResponse } from '@/types';

export const callsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Call>>('/calls/', { params }),

  get: (id: string) =>
    api.get<Call>(`/calls/${id}/`),

  originate: (phone_number: string, customer_id?: string) =>
    api.post('/calls/originate/', { phone_number, customer_id }),

  screenPop: (phone: string) =>
    api.get('/calls/screen-pop/', { params: { phone } }),

  submitDisposition: (callId: string, disposition_id: string, notes = '') =>
    api.post(`/calls/${callId}/disposition/`, { disposition_id, notes }),

  dispositions: () =>
    api.get<Disposition[]>('/calls/dispositions/'),
};
