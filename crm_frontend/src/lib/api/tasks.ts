import api from './axios';
import { Task, TaskStats } from '@/types';

export interface TaskFilters {
  status?:      string;
  priority?:    string;
  assigned_to?: string;
  lead?:        string;
  ticket?:      string;
  overdue?:     boolean;
  search?:      string;
  page?:        number;
  page_size?:   number;
}

export interface CreateTaskData {
  title:        string;
  description?: string;
  priority:     string;
  assigned_to:  string;
  due_date?:    string | null;
  lead?:        string | null;
  ticket?:      string | null;
  call?:        string | null;
}

export const tasksApi = {
  list: (filters: TaskFilters = {}) =>
    api.get('/tasks/', { params: filters }).then((r: any) => r.data),

  get: (id: string) =>
    api.get<Task>(`/tasks/${id}/`).then((r: any) => r.data),

  create: (data: CreateTaskData) =>
    api.post<Task>('/tasks/', data).then((r: any) => r.data),

  update: (id: string, data: Partial<CreateTaskData>) =>
    api.patch<Task>(`/tasks/${id}/`, data).then((r: any) => r.data),

  start: (id: string) =>
    api.patch<Task>(`/tasks/${id}/start/`).then((r: any) => r.data),

  complete: (id: string, comment?: string) =>
    api.patch<Task>(`/tasks/${id}/complete/`, { comment }).then((r: any) => r.data),

  cancel: (id: string) =>
    api.patch<Task>(`/tasks/${id}/cancel/`).then((r: any) => r.data),

  myStats: () =>
    api.get<TaskStats>('/tasks/my-stats/').then((r: any) => r.data),

  teamStats: (assigned_to?: string) =>
    api.get<TaskStats>('/tasks/team-stats/', {
      params: assigned_to ? { assigned_to } : {},
    }).then((r: any) => r.data),
};
