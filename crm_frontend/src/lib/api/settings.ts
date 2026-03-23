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

interface PaginatedSettings {
  count:   number;
  results: SystemSetting[];
}

export const settingsApi = {
  /** Return all settings (admin only) */
  list: () =>
    api.get<PaginatedSettings>('/settings/?page_size=100').then((r) => ({
      ...r,
      data: Array.isArray(r.data) ? r.data : (r.data?.results ?? []),
    })),

  /** Update an existing setting by id */
  update: (id: string, value: string) =>
    api.patch<SystemSetting>(`/settings/${id}/`, { value }),

  /** Create a brand-new setting key */
  create: (data: Omit<SystemSetting, 'id' | 'updated_at'>) =>
    api.post<SystemSetting>('/settings/', data),
};
