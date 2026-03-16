import api from './axios';
import type { Call, Disposition, PaginatedResponse } from '@/types';

export const callsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Call>>('/calls/', { params }),

  get: (id: string) =>
    api.get<Call>(`/calls/${id}/`),

  originate: (data: { phone_number: string; customer_id?: string; lead_id?: string }) =>
    api.post('/calls/originate/', data),

  screenPop: (phone: string) =>
    api.get('/calls/screen-pop/', { params: { phone } }),

  addDisposition: (callId: string, data: {
    disposition_id: string;
    notes?: string;
  }) => api.post(`/calls/${callId}/add_disposition/`, data),

  dispositions: () =>
    api.get<Disposition[]>('/calls/dispositions/'),
};
