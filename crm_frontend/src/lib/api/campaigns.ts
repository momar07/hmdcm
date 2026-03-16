import api from './axios';
import type { Campaign, PaginatedResponse } from '@/types';

export const campaignsApi = {
  list: () =>
    api.get<PaginatedResponse<Campaign>>('/campaigns/'),

  get: (id: string) =>
    api.get<Campaign>(`/campaigns/${id}/`),

  create: (data: Partial<Campaign>) =>
    api.post<Campaign>('/campaigns/', data),

  update: (id: string, data: Partial<Campaign>) =>
    api.patch<Campaign>(`/campaigns/${id}/`, data),

  changeStatus: (id: string, status: string) =>
    api.patch(`/campaigns/${id}/status/`, { status }),

  addCustomers: (id: string, customer_ids: string[]) =>
    api.post(`/campaigns/${id}/add-customers/`, { customer_ids }),

  members: (id: string) =>
    api.get(`/campaigns/${id}/members/`),
};
