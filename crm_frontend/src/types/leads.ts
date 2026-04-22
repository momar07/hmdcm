// Lead Types — Lead is the primary entity
export type LeadLifecycle =
  | 'lead' | 'prospect' | 'opportunity' | 'customer' | 'churned';

export type LeadClassification = 'none' | 'cold' | 'warm' | 'hot' | 'very_hot';

export type LeadSource =
  | 'manual' | 'call' | 'campaign' | 'referral' | 'web' | 'other';

export interface LeadStage {
  id: string;
  name: string;
  slug: string;
  order: number;
  color: string;
  is_closed: boolean;
  is_won: boolean;
}

export interface Lead {
  id: string;
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company: string;
  source: LeadSource;
  value: string | null;
  score: number;
  classification: LeadClassification;
  lifecycle_stage: LeadLifecycle;
  stage: string | null;
  stage_name: string;
  stage_color: string;
  priority: string | null;
  priority_name: string;
  assigned_to: string | null;
  assigned_name: string | null;
  converted_to_customer: boolean;
  converted_at: string | null;
  customer_id: string | null;
  customer_name: string | null;
  won_amount: string | null;
  won_at: string | null;
  lost_reason: string;
  lost_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadCreatePayload {
  title: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  company?: string;
  source: LeadSource;
  value?: number | null;
  stage?: string | null;
  assigned_to?: string | null;
  description?: string;
}

export interface MarkWonPayload  { won_amount?: number }
export interface MarkLostPayload { lost_reason: string }

export interface TimelineEvent {
  type: string;
  subtype?: string;
  date: string;
  note?: string;
  title?: string;
  status?: string;
  actor?: string;
  author?: string;
  agent?: string;
  duration?: number;
  points?: number;
  ref?: string;
  amount?: string;
}
