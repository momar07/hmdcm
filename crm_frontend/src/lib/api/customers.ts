import api from './axios';
import type { Customer, CustomerPhone, PaginatedResponse } from '@/types';

export const customersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Customer>>('/customers/', { params }),

  get: (id: string) =>
    api.get<Customer>(`/customers/${id}/`),

  create: (data: Partial<Customer>) =>
    api.post<Customer>('/customers/', data),

  update: (id: string, data: Partial<Customer>) =>
    api.patch<Customer>(`/customers/${id}/`, data),

  delete: (id: string) =>
    api.delete(`/customers/${id}/`),

  search: (q: string) =>
    api.get<Customer[]>('/customers/search/', { params: { q } }),

  addPhone: (customerId: string, data: Partial<CustomerPhone>) =>
    api.post<CustomerPhone>(`/customers/${customerId}/phones/`, data),

  screenPop: (phone: string) =>
    api.get('/calls/screen-pop/', { params: { phone } }),
};
