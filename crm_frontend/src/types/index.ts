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
  customer:       string | Customer;
  customer_name:  string;
  customer_detail?: Customer;
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
  customer:      string | null;
  customer_name: string | null;
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
  call:             string | null;
  assigned_to:      string;
  assigned_to_name: string;
  customer_id:      string | null;
  customer_name:    string | null;
  customer_phone:   string | null;
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
  total_customers: number;
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
  callee:          string;
  queue:           string;
  direction:       'inbound' | 'outbound' | 'internal';
  agent_extension: string;
  customer_id:     string | null;
  customer_name:   string | null;
  customer_phone:  string | null;
  customer_company?: string | null;
  lead_id:         string | null;
  lead_title?:     string | null;
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
  customer:     string;
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
