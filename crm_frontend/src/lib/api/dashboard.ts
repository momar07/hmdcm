import api from './axios';
import type { DashboardData } from '@/types';

export const dashboardApi = {
  get: () => api.get<DashboardData>('/dashboard/'),
};
