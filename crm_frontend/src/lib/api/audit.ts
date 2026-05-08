import api from './axios';
import type { AuditLogEntry, ActivityLogEntry, PaginatedResponse } from '@/types';

export interface AuditQueryParams {
  page?:        number;
  page_size?:   number;
  user?:        string;   // user UUID
  action?:      string;   // create | update | delete | login | logout | export | call
  ordering?:    string;   // e.g. '-timestamp'
}

export interface ActivityQueryParams {
  page?:        number;
  page_size?:   number;
  user?:        string;
  verb?:        string;   // e.g. 'lead.archived'
  lead?:        string;   // lead UUID
  ordering?:    string;
}

export const auditApi = {
  /** GET /api/audit/audit/  — raw API audit log (admin only). */
  auditLogs: (params?: AuditQueryParams) =>
    api.get<PaginatedResponse<AuditLogEntry>>('/audit/audit/', { params }),

  /** GET /api/audit/activity/ — human-readable activity feed (supervisor+). */
  activityLogs: (params?: ActivityQueryParams) =>
    api.get<PaginatedResponse<ActivityLogEntry>>('/audit/activity/', { params }),
};
