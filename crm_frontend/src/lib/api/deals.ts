import api from './axios';
import type { Deal, PaginatedResponse } from '@/types';

export interface DealCreatePayload {
  lead:                string;
  title:               string;
  description?:        string;
  stage?:              string | null;
  assigned_to?:        string | null;
  value?:              number | null;
  currency?:           string;
  source?:             string;
  campaign?:           string | null;
  expected_close_date?: string | null;
}

export const dealsApi = {
  list: (params?: {
    lead?: string;
    stage?: string;
    assigned_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }) =>
    api.get<PaginatedResponse<Deal>>('/deals/', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<Deal>('/deals/' + id + '/').then((r) => r.data),

  create: (data: DealCreatePayload) =>
    api.post<Deal>('/deals/', data).then((r) => r.data),

  update: (id: string, data: Partial<DealCreatePayload>) =>
    api.patch<Deal>('/deals/' + id + '/', data).then((r) => r.data),

  delete: (id: string) =>
    api.delete('/deals/' + id + '/'),

  moveStage: (id: string, stage_id: string) =>
    api.post<Deal>('/deals/' + id + '/move-stage/', { stage_id }).then((r) => r.data),

  markWon: (id: string, won_amount?: number) =>
    api.post<Deal>('/deals/' + id + '/mark-won/', { won_amount }).then((r) => r.data),

  markLost: (id: string, lost_reason: string) =>
    api.post<Deal>('/deals/' + id + '/mark-lost/', { lost_reason }).then((r) => r.data),
};
