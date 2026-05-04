// ── Auth ──────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'supervisor' | 'agent' | 'qa';

export interface AuthUser {
  id:         string;
  email:      string;
  first_name: string;
  last_name:  string;
  full_name:  string;
  role:       Role;
  extension:  Extension | null;
  team_id:    string | null;
}

export interface LoginCredentials {
  email:    string;
  password: string;
}

export interface AuthTokens {
  access:  string;
  refresh: string;
  user:    AuthUser;
}

// ── Users ─────────────────────────────────────────────────────────────────
export type AgentStatus = 'available' | 'busy' | 'away' | 'offline' | 'on_call';

export interface User {
  id:         string;
  email:      string;
  first_name: string;
  last_name:  string;
  full_name:  string;
  role:       Role;
  status:     AgentStatus;
  is_active:  boolean;
  team:       string | null;
  extension:  Extension | null;
  avatar:     string | null;
  phone:      string | null;
}

export interface Extension {
  id:        string;
  number:    string;
  peer_name: string;
  is_active: boolean;
  secret:            string | null;
  vicidial_user:     string | null;
  vicidial_pass:     string | null;
  vicidial_campaign: string | null;
  vicidial_ingroup:  string | null;
}

export interface Team {
  id:           string;
  name:         string;
  description:  string;
  supervisor:   string | null;
  member_count: number;
  is_active:    boolean;
}

// ── Customers ─────────────────────────────────────────────────────────────
export interface CustomerTag {
  id:    string;
  name:  string;
  color: string;
}

export interface CustomerPhone {
  id:         string;
  number:     string;
  normalized: string;
  phone_type: 'mobile' | 'home' | 'work' | 'fax' | 'other';
  is_primary: boolean;
  is_active:  boolean;
}

export interface Customer {
  id:            string;
  first_name:    string;
  last_name:     string;
  email:         string;
  gender:        string;
  date_of_birth: string | null;
  address:       string;
  city:          string;
  country:       string;
  company:       string;
  notes:         string;
  primary_phone: string | null;
  phones:        CustomerPhone[];
  tags:          CustomerTag[];
  assigned_to:   string | null;
  is_active:     boolean;
  source:        string;
  created_at:    string;
  updated_at:    string;
}

// ── Leads ─────────────────────────────────────────────────────────────────
export interface LeadStatus {
  id:         string;
  name:       string;
  color:      string;
  order:      number;
  is_closed:  boolean;
  is_won:     boolean;
  is_default: boolean;
}

export interface LeadPriority {
  id:    string;
  name:  string;
  level: number;
  color: string;
}

export interface LeadStage {
  id:        string;
  name:      string;
  slug:      string;
  order:     number;
  color:     string;
  is_closed: boolean;
  is_won:    boolean;
  is_active: boolean;
}

export interface Lead {
  id:             string;
  title:          string;
  phone:          string;
  email:          string;
  first_name:     string;
  last_name:      string;
  company:        string;
  address:        string;
  city:           string;
  country:        string;
  status:         string | LeadStatus;
  status_name:    string;
  status_detail?: LeadStatus;
  priority:       string | LeadPriority | null;
  priority_name:  string;
  priority_detail?: LeadPriority;
  stage:          string | null;
  stage_name:     string | null;
  stage_color:    string | null;
  stage_slug:     string | null;
  source:         string;
  assigned_to:    string | null;
  assigned_name:  string;
  campaign:       string | null;
  description:    string;
  value:          number | null;
  followup_date:  string | null;
  won_at:         string | null;
  lost_at:        string | null;
  won_amount:     number | null;
  lost_reason:    string;
  is_active:      boolean;
  created_at:     string;
  updated_at:     string;
}

// ── Calls ─────────────────────────────────────────────────────────────────
export type CallDirection = 'inbound' | 'outbound' | 'internal';
export type CallStatus    =
  | 'ringing' | 'answered' | 'no_answer'
  | 'busy' | 'failed' | 'voicemail' | 'transferred';

export interface Call {
  id:            string;
  uniqueid:      string;
  direction:     CallDirection;
  status:        CallStatus;
  caller_number: string;
  callee_number: string;
  agent:         string | null;
  agent_name:    string | null;
  lead:          string | null;
  lead_name:     string | null;
  duration:      number;
  started_at:    string | null;
  ended_at:      string | null;
  has_recording: boolean;
  recording_url: string;
  created_at:    string;
}

export interface Disposition {
  id:                string;
  name:              string;
  color:             string;
  requires_followup: boolean;
  is_active:         boolean;
}

// ── Followups ─────────────────────────────────────────────────────────────
export interface Followup {
  id:               string;
  lead:             string | null;
  lead_title:       string | null;
  lead_name:        string | null;
  lead_phone:       string | null;
  call:             string | null;
  assigned_to:      string;
  assigned_to_name: string;
  title:            string;
  description:      string;
  followup_type:    'call' | 'email' | 'meeting' | 'sms' | 'other';
  scheduled_at:     string;
  completed_at:     string | null;
  status:           'pending' | 'completed' | 'cancelled' | 'rescheduled';
  reminder_sent:    boolean;
  created_at:       string;
  updated_at:       string;
}

// ── Campaigns ─────────────────────────────────────────────────────────────
export interface Campaign {
  id:              string;
  name:            string;
  description:     string;
  campaign_type:   'outbound' | 'inbound' | 'blended';
  status:          'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  queue:           string | null;
  start_date:      string | null;
  end_date:        string | null;
  member_count:    number;
  created_by:      string;
  created_by_name: string;
  created_at:      string;
}

// ── Dashboard ─────────────────────────────────────────────────────────────
export interface AgentDashboard {
  role:               'agent';
  calls_today:        number;
  answered_today:     number;
  avg_duration_today: number;
  open_leads:         number;
  pending_followups:  number;
  due_followups:      number;
}

export interface SupervisorDashboard {
  role:               'supervisor';
  team_size:          number;
  agents_available:   number;
  agents_on_call:     number;
  calls_today:        number;
  answered_today:     number;
  avg_duration_today: number;
  active_calls:       number;
}

export interface AdminDashboard {
  role:            'admin';
  total_leads:     number;
  calls_today:     number;
  active_agents:   number;
  total_agents:    number;
  calls_this_week: number;
}

export type DashboardData = AgentDashboard | SupervisorDashboard | AdminDashboard;

// ── WebSocket Events ──────────────────────────────────────────────────────
export interface IncomingCallEvent {
  type:            'incoming_call';
  uniqueid:        string;
  call_id:         string;
  caller:          string;
  caller_name:     string;
  callee:          string;
  queue:           string;
  direction:       'inbound' | 'outbound' | 'internal';
  agent_extension: string;
  // Lead info
  lead_id:         string | null;
  lead_title?:     string | null;
  lead_phone?:     string | null;
  lead_stage?:     string | null;
  lead_status?:    string | null;
  lead_assigned?:  string | null;
  lead_value?:     string | null;
  lead_source?:    string;
  lead_name?:      string | null;
  lead_company?:   string | null;
  lead_email?:     string | null;
}

export interface CallEndedEvent {
  type:     'call_ended';
  uniqueid: string;
  status:   CallStatus;
}

export interface AgentStatusEvent {
  type:       'agent_status' | 'agent_status_update';
  agent_id:   string;
  agent_name?: string;
  status:     AgentStatus;
  extension?:  string | null;
}

export interface FollowupReminderEvent {
  type:         'followup_reminder';
  followup_id:  string;
  title:        string;
  lead_name:    string;
  lead_phone:   string | null;
  scheduled_at: string;
}

export type WSEvent =
  | IncomingCallEvent
  | CallEndedEvent
  | AgentStatusEvent
  | FollowupReminderEvent
  | { type: string; [key: string]: unknown };  // catch-all for future events

// ── Pagination ────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}

// ── Generic Table Column ──────────────────────────────────────────────────
export interface Column<T> {
  key:     keyof T | string;
  header:  string;
  render?: (row: T) => React.ReactNode;
  width?:  string;
}

export interface LeadEvent {
  id:           string;
  event_type:   string;
  actor_name:   string | null;
  old_value:    string;
  new_value:    string;
  note:         string;
  created_at:   string;
}

// ─── Tasks ────────────────────────────────────────────────────
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus   = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TaskLog {
  id:         string;
  action:     string;
  detail:     string;
  actor_name: string;
  created_at: string;
}

export interface Task {
  id:               string;
  title:            string;
  description:      string;
  priority:         TaskPriority;
  status:           TaskStatus;
  assigned_to:      string;
  assigned_to_name: string;
  assigned_by:      string | null;
  assigned_by_name: string;
  lead:             string | null;
  lead_name:        string | null;
  lead_title:       string | null;
  lead_phone:       string | null;
  ticket:           string | null;
  ticket_title:     string | null;
  call:             string | null;
  due_date:         string | null;
  completed_at:     string | null;
  comment:          string;
  action_type:      string;
  reminder_at:      string | null;
  reminder_sent:    boolean;
  followup:         string | null;
  is_overdue:       boolean;
  logs:             TaskLog[];
  created_at:       string;
  updated_at:       string;
}

export interface TaskStats {
  pending:         number;
  in_progress:     number;
  overdue:         number;
  completed_today: number;
}

// ─── Sales ────────────────────────────────────────────────────

export type QuotationType = 'price_quote' | 'contract';
export type QuotationStatus =
  | 'draft' | 'pending_approval' | 'approved'
  | 'sent'  | 'accepted' | 'rejected' | 'expired' | 'revision';

export type ProductPricingType = 'fixed' | 'per_unit' | 'variants';

export interface SalesSettings {
  id:                     number;
  enable_price_quotation: boolean;
  enable_contract:        boolean;
  company_name:           string;
  company_logo:           string | null;
  company_address:        string;
  default_currency:       string;
  default_tax_rate:       number;
  quotation_prefix:       string;
  next_quotation_number:  number;
}

export interface TermsTemplate {
  id:              string;
  name:            string;
  category:        string;
  body:            string;
  is_active:       boolean;
  created_by:      string | null;
  created_by_name: string;
  created_at:      string;
  updated_at:      string;
}

export interface ProductDimensionField {
  id:    string;
  label: string;
  unit:  string;
  order: number;
}

export interface ProductVariant {
  id:        string;
  name:      string;
  price:     number;
  is_active: boolean;
}

export interface Product {
  id:               string;
  name:             string;
  description:      string;
  sku:              string;
  category:         string;
  pricing_type:     ProductPricingType;
  base_price:       number;
  unit:             string;
  currency:         string;
  is_active:        boolean;
  created_by:       string | null;
  created_by_name:  string;
  dimension_fields: ProductDimensionField[];
  variants:         ProductVariant[];
  created_at:       string;
  updated_at:       string;
}

export interface QuotationItem {
  id:           string;
  product:      string | null;
  product_name: string;
  description:  string;
  qty:          number;
  unit_price:   number;
  discount_pct: number;
  line_total:   number;
  dimensions:   Record<string, number>;
  note:         string;
  order:        number;
}

export interface QuotationField {
  id:    string;
  key:   string;
  value: string;
  order: number;
}

export interface QuotationLog {
  id:         string;
  action:     string;
  detail:     string;
  actor_name: string;
  created_at: string;
}

export interface Quotation {
  id:             string;
  ref_number:     string;
  version:        number;
  parent:         string | null;
  quotation_type: QuotationType;
  status:         QuotationStatus;
  title:          string;
  agent:          string | null;
  agent_name:     string;
  lead:           string | null;
  lead_name:      string;
  lead_title:     string;
  currency:       string;
  tax_rate:       number;
  subtotal:       number;
  tax_amount:     number;
  total_amount:   number;
  valid_until:    string | null;
  terms_body:     string;
  internal_note:  string;
  approval:       string | null;
  reviewed_by:    string | null;
  reviewed_at:    string | null;
  review_comment: string;
  items:          QuotationItem[];
  fields_data:    QuotationField[];
  logs:           QuotationLog[];
  is_expired:     boolean;
  created_at:     string;
  updated_at:     string;
}

