import api from './axios';

export type NotificationType =
  | 'task_assigned'
  | 'task_reminder'
  | 'followup_reminder'
  | 'call_incoming'
  | 'call_missed'
  | 'vip_call'
  | 'quotation_pending'
  | 'quotation_update'
  | 'approval_needed'
  | 'lead_assigned'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id:         string;
  type:       NotificationType;
  title:      string;
  body:       string;
  data:       Record<string, any>;
  link:       string;
  priority:   NotificationPriority;
  is_read:    boolean;
  read_at:    string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

export const notificationsApi = {
  list: (params?: { unread?: boolean; type?: string; page?: number }) =>
    api.get<PaginatedResponse<Notification>>('/notifications/', {
      params: {
        ...(params?.unread ? { unread: 'true' } : {}),
        ...(params?.type   ? { type: params.type } : {}),
        ...(params?.page   ? { page: params.page } : {}),
      },
    }),

  unreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count/'),

  markRead: (id: string) =>
    api.post<Notification>(`/notifications/${id}/mark-read/`),

  markAllRead: () =>
    api.post<{ updated: number }>('/notifications/mark-all-read/'),

  remove: (id: string) =>
    api.delete<void>(`/notifications/${id}/`),
};
