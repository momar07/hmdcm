import api from './axios';

export interface SystemSetting {
  id:          string;
  key:         string;
  value:       string;
  description: string;
  category:    'general' | 'telephony' | 'security' | 'notifications';
  is_public:   boolean;
  updated_at:  string;
}

export const settingsApi = {
  /** Return all settings (admin only) */
  list: () =>
    api.get<SystemSetting[]>('/settings/'),

  /** Bulk-upsert: POST each changed key individually via PATCH by id */
  update: (id: string, value: string) =>
    api.patch<SystemSetting>(`/settings/${id}/`, { value }),

  /** Create a brand-new setting key */
  create: (data: Omit<SystemSetting, 'id' | 'updated_at'>) =>
    api.post<SystemSetting>('/settings/', data),
};
