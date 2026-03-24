import api from './axios';

export interface ApprovalRequest {
  id:                string;
  approval_type:     'refund' | 'discount' | 'exception' | 'leave' | 'other';
  status:            'pending' | 'approved' | 'rejected' | 'cancelled';
  title:             string;
  description:       string;
  amount:            string | null;
  requested_by:      string;
  requested_by_name: string;
  reviewed_by:       string | null;
  reviewed_by_name:  string | null;
  review_comment:    string;
  reviewed_at:       string | null;
  customer:          string | null;
  customer_name:     string | null;
  ticket:            string | null;
  ticket_number:     number | null;
  lead:              string | null;
  created_at:        string;
  updated_at:        string;
}

export interface ApprovalCreatePayload {
  approval_type: string;
  title:         string;
  description?:  string;
  amount?:       number | null;
  ticket?:       string | null;
  customer?:     string | null;
  lead?:         string | null;
}

export const approvalsApi = {
  list: (params?: Record<string, string>) =>
    api.get<{ count: number; results: ApprovalRequest[] }>('/approvals/', { params }),

  get: (id: string) =>
    api.get<ApprovalRequest>(`/approvals/${id}/`),

  create: (data: ApprovalCreatePayload) =>
    api.post<ApprovalRequest>('/approvals/', data),

  pending: () =>
    api.get<{ count: number; results: ApprovalRequest[] }>('/approvals/pending/'),

  approve: (id: string, comment?: string) =>
    api.post<ApprovalRequest>(`/approvals/${id}/approve/`, { review_comment: comment ?? '' }),

  reject: (id: string, comment?: string) =>
    api.post<ApprovalRequest>(`/approvals/${id}/reject/`, { review_comment: comment ?? '' }),

  cancel: (id: string) =>
    api.post<ApprovalRequest>(`/approvals/${id}/cancel/`),
};
