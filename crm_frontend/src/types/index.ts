// ── Auth ──────────────────────────────────────────────────────────────────
export type Role = 'admin' | 'supervisor' | 'agent' | 'qa';

export interface AuthUser {
  id:         string;
  email:      string;
  full_name:  string;
  role:       Role;
  extension:  string | null;
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
}

export interface Extension {
  id:        string;
  number:    string;
  peer_name: string;
  is_active: boolean;
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
  company:       string;
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
}

export interface LeadPriority {
  id:    string;
  name:  string;
  level: number;
  color: string;
}

export interface Lead {
  id:            string;
  title:         string;
  customer:      string | Customer;
  customer_name: string;
  status:        string | LeadStatus;
  status_name:   string;
  priority:      string | LeadPriority;
  priority_name: string;
  source:        string;
  assigned_to:   string | null;
  assigned_name: string;
  value:         number | null;
  followup_date: string | null;
  created_at:    string;
  updated_at:    string;
}

// ── Calls ─────────────────────────────────────────────────────────────────
export type CallDirection = 'inbound' | 'outbound' | 'internal';
export type CallStatus    = 'ringing' | 'answered' | 'no_answer' | 'busy' | 'failed' | 'voicemail' | 'transferred';

export interface Call {
  id:             string;
  uniqueid:       string;
  direction:      CallDirection;
  status:         CallStatus;
  caller_number:  string;
  callee_number:  string;
  agent:          string | null;
  agent_name:     string | null;
  customer:       string | null;
  customer_name:  string | null;
  duration:       number;
  started_at:     string | null;
  ended_at:       string | null;
  has_recording:  boolean;
  recording_url:  string;
  created_at:     string;
}

export interface Disposition {
  id:               string;
  name:             string;
  color:            string;
  requires_followup: boolean;
  is_active:        boolean;
}

// ── Followups ─────────────────────────────────────────────────────────────
export interface Followup {
  id:            string;
  customer:      string;
  customer_name: string;
  lead:          string | null;
  call:          string | null;
  assigned_to:   string;
  assigned_name: string;
  title:         string;
  description:   string;
  followup_type: 'call' | 'email' | 'meeting' | 'sms' | 'other';
  scheduled_at:  string;
  completed_at:  string | null;
  status:        'pending' | 'completed' | 'cancelled' | 'rescheduled';
  created_at:    string;
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
  role:                'agent';
  calls_today:         number;
  answered_today:      number;
  avg_duration_today:  number;
  open_leads:          number;
  pending_followups:   number;
  due_followups:       number;
}

export interface SupervisorDashboard {
  role:                'supervisor';
  team_size:           number;
  agents_available:    number;
  agents_on_call:      number;
  calls_today:         number;
  answered_today:      number;
  avg_duration_today:  number;
  active_calls:        number;
}

export interface AdminDashboard {
  role:             'admin';
  total_customers:  number;
  total_leads:      number;
  calls_today:      number;
  active_agents:    number;
  total_agents:     number;
  calls_this_week:  number;
}

export type DashboardData = AgentDashboard | SupervisorDashboard | AdminDashboard;

// ── WebSocket Events ──────────────────────────────────────────────────────
export interface IncomingCallEvent {
  type:            'incoming_call';
  uniqueid:        string;
  caller:          string;
  queue:           string;
  agent_extension: string;
  customer_id:     string | null;
  customer_name:   string | null;
}

export interface CallEndedEvent {
  type:    'call_ended';
  uniqueid: string;
  status:   CallStatus;
}

export interface AgentStatusEvent {
  type:     'agent_status';
  agent_id: string;
  status:   AgentStatus;
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
  | FollowupReminderEvent;

// ── Pagination ────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  count:    number;
  next:     string | null;
  previous: string | null;
  results:  T[];
}
