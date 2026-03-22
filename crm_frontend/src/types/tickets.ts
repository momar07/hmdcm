// ═══════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════

export type TicketStatus   = "open" | "in_progress" | "pending" | "resolved" | "closed"
export type TicketPriority = "low" | "medium" | "high" | "urgent"
export type TicketType     = "complaint" | "request" | "inquiry"
export type TicketSource   = "call" | "manual" | "email" | "portal" | "system"
export type NoteVisibility = "internal" | "public"
export type AttachmentType = "file" | "image" | "call_recording"

// ═══════════════════════════════════════════════════════════════
// TAG
// ═══════════════════════════════════════════════════════════════

export interface Tag {
  id    : string
  name  : string
  color : string
}

// ═══════════════════════════════════════════════════════════════
// SLA POLICY
// ═══════════════════════════════════════════════════════════════

export interface SLAPolicy {
  id                  : string
  name                : string
  priority            : TicketPriority
  first_response_hrs  : number
  resolution_hrs      : number
  business_hours_only : boolean
  work_start_hour     : number
  work_end_hour       : number
  is_active           : boolean
}

// ═══════════════════════════════════════════════════════════════
// TICKET NOTE
// ═══════════════════════════════════════════════════════════════

export interface TicketNote {
  id                : string
  ticket            : string
  content           : string
  visibility        : NoteVisibility
  author_id         : string
  author_name       : string
  is_first_response : boolean
  edited_at         : string | null
  created_at        : string
}

// ═══════════════════════════════════════════════════════════════
// TICKET ATTACHMENT
// ═══════════════════════════════════════════════════════════════

export interface TicketAttachment {
  id               : string
  ticket           : string
  note             : string | null
  file_name        : string
  file_path        : string
  file_size        : number | null
  file_size_kb     : string
  mime_type        : string
  attachment_type  : AttachmentType
  asterisk_call_id : string
  call             : string | null
  uploaded_by_name : string
  created_at       : string
}

// ═══════════════════════════════════════════════════════════════
// TICKET HISTORY
// ═══════════════════════════════════════════════════════════════

export interface TicketHistory {
  id         : string
  field      : string
  old_value  : string
  new_value  : string
  note       : string
  actor_name : string
  created_at : string
}

// ═══════════════════════════════════════════════════════════════
// TICKET — LIST ITEM
// ═══════════════════════════════════════════════════════════════

export interface TicketListItem {
  id                    : string
  ticket_number         : number
  title                 : string
  ticket_type           : TicketType
  category              : string
  source                : TicketSource
  status                : TicketStatus
  priority              : TicketPriority
  customer_id           : string | null
  customer_name         : string
  customer_email        : string
  phone_number          : string
  asterisk_call_id      : string
  queue                 : string
  agent_id              : string | null
  agent_name            : string
  created_by_name       : string
  sla_breached          : boolean
  sla_response_breached : boolean
  resolution_deadline   : string | null
  response_time_deadline: string | null
  is_overdue            : boolean
  response_overdue      : boolean
  sla_remaining_mins    : number | null
  is_escalated          : boolean
  note_count            : number
  attachment_count      : number
  tags                  : Tag[]
  created_at            : string
  updated_at            : string
  resolved_at           : string | null
}

// ═══════════════════════════════════════════════════════════════
// TICKET — FULL DETAIL
// ═══════════════════════════════════════════════════════════════

export interface TicketDetail extends TicketListItem {
  description           : string
  customer              : string | null
  agent                 : string | null
  created_by            : string | null
  sla_policy            : string | null
  sla_policy_data       : SLAPolicy | null
  first_response_at     : string | null
  escalated_at          : string | null
  escalated_to          : string | null
  escalated_to_name     : string
  escalation_note       : string
  phone_number_normalized: string
  call                  : string | null
  meta                  : Record<string, unknown>
  closed_at             : string | null
  notes                 : TicketNote[]
  attachments           : TicketAttachment[]
  history               : TicketHistory[]
}

// ═══════════════════════════════════════════════════════════════
// TICKET — CREATE PAYLOAD
// ═══════════════════════════════════════════════════════════════

export interface TicketCreatePayload {
  title            : string
  description?     : string
  ticket_type      : TicketType
  category?        : string
  source           : TicketSource
  priority         : TicketPriority
  customer?        : string | null
  agent?           : string | null
  phone_number?    : string
  asterisk_call_id?: string
  call?            : string | null
  queue?           : string
  sla_policy?      : string | null
  tag_ids?         : string[]
  meta?            : Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// TICKET — UPDATE PAYLOAD
// ═══════════════════════════════════════════════════════════════

export interface TicketUpdatePayload {
  title?           : string
  description?     : string
  ticket_type?     : TicketType
  category?        : string
  priority?        : TicketPriority
  status?          : TicketStatus
  agent?           : string | null
  sla_policy?      : string | null
  is_escalated?    : boolean
  escalated_to?    : string | null
  escalation_note? : string
  tag_ids?         : string[]
  meta?            : Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════════════════════════

export interface TicketStats {
  total_open        : number
  total_in_progress : number
  total_pending     : number
  total_resolved    : number
  total_closed      : number
  total_breached    : number
  total_escalated   : number
  urgent_open       : number
  overdue_count     : number
  avg_resolution_hrs: number | null
}

export interface AgentWorkload {
  agent__id         : string
  agent__first_name : string
  agent__last_name  : string
  open_count        : number
  in_prog_count     : number
  breached_count    : number
  escalated_count   : number
  total             : number
}

export interface TicketDashboard {
  stats    : TicketStats
  workload : AgentWorkload[]
}

// ═══════════════════════════════════════════════════════════════
// PAGINATION
// ═══════════════════════════════════════════════════════════════

export interface PaginatedTickets {
  count    : number
  next     : string | null
  previous : string | null
  results  : TicketListItem[]
}

// ═══════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════

export interface TicketFilters {
  status?       : TicketStatus[]
  priority?     : TicketPriority[]
  ticket_type?  : TicketType[]
  source?       : TicketSource[]
  agent?        : string
  customer?     : string
  queue?        : string
  sla_breached? : boolean
  is_escalated? : boolean
  is_overdue?   : boolean
  search?       : string
  tag?          : string
  created_after?: string
  created_before?: string
  ordering?     : string
  page?         : number
  page_size?    : number
}

// ═══════════════════════════════════════════════════════════════════
// ALIASES — for component compatibility
// ═══════════════════════════════════════════════════════════════════

/** Alias: TicketListItem → Ticket  (used in components) */
export type Ticket = TicketListItem

/** Generic paginated API response */
export interface PaginatedResponse<T> {
  count    : number
  next     : string | null
  previous : string | null
  results  : T[]
}
