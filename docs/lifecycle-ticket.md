# Ticket Lifecycle

## Overview

This document describes the complete lifecycle of support tickets in the HMDM CRM system. Tickets represent customer issues, requests, or complaints that need to be tracked and resolved within SLA (Service Level Agreement) constraints.

---

## Phase 1: Ticket Creation

### 1.1 Creation Sources

Tickets can be created from:

| Source | Trigger | Description |
|---|---|---|
| **Manual** | Agent creates via UI | Agent creates ticket from customer/lead page |
| **Call Disposition** | Disposition action `create_ticket` | Auto-created after call disposition |
| **Customer Portal** | Customer submits request | Self-service ticket creation |
| **Email** | Email-to-ticket | Email parsed into ticket (if configured) |
| **Escalation** | Disposition action `escalate` | Supervisor creates ticket from escalation |

### 1.2 Creation via Call Disposition

**File:** `crm_backend/apps/calls/services.py`

When a disposition has `create_ticket` action:

```python
def _create_ticket(call, action):
    Ticket.objects.create(
        customer=call.customer,
        lead=call.lead,
        title=f"Ticket from call: {call.disposition.name}",
        description=call.completion.note,
        priority=action.ticket_priority or "medium",
        category=action.ticket_category,
        assigned_to=call.agent,
        status="open",
        created_by=call.agent,
    )
```

### 1.3 Manual Creation

Agent creates a ticket from a customer or lead detail page:

| Field | Required | Description |
|---|---|---|
| `customer` | Yes | Associated customer |
| `title` | Yes | Ticket subject |
| `description` | Yes | Issue details |
| `priority` | Yes | Low, Medium, High, Urgent |
| `category` | No | Issue category |
| `assigned_to` | No | Assigned agent |
| `lead` | No | Associated lead |

**API:** `POST /api/tickets/`

---

## Phase 2: Ticket Initialization

### 2.1 Ticket Record

**File:** `crm_backend/apps/tickets/models.py`

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `ticket_number` | Human-readable number (e.g., TKT-00123) |
| `customer` | FK to associated customer |
| `lead` | FK to associated lead |
| `title` | Ticket subject |
| `description` | Issue details |
| `status` | Current status |
| `priority` | Priority level |
| `category` | Issue category |
| `assigned_to` | FK to assigned agent |
| `created_by` | FK to creating user |
| `sla_policy` | FK to SLA policy |
| `sla_deadline` | Response/resolution deadline |
| `first_response_at` | Time of first response |
| `resolved_at` | Time of resolution |
| `closed_at` | Time of closure |

### 2.2 Ticket Statuses

| Status | Description |
|---|---|
| `open` | Newly created, awaiting response |
| `in_progress` | Agent is working on it |
| `waiting_on_customer` | Waiting for customer response |
| `waiting_on_third_party` | Waiting on external party |
| `resolved` | Issue resolved, awaiting confirmation |
| `closed` | Confirmed resolved or auto-closed |
| `reopened` | Customer reopened after resolution |

### 2.3 Ticket Priorities

| Priority | Response SLA | Resolution SLA |
|---|---|---|
| `low` | 8 hours | 48 hours |
| `medium` | 4 hours | 24 hours |
| `high` | 2 hours | 8 hours |
| `urgent` | 30 minutes | 4 hours |

---

## Phase 3: SLA Management

### 3.1 SLA Policy

**File:** `crm_backend/apps/tickets/models.py`

Each ticket is associated with an SLA policy:

| Field | Description |
|---|---|
| `name` | Policy name |
| `first_response_time` | Max time to first response |
| `resolution_time` | Max time to resolution |
| `business_hours_only` | Whether SLA counts only business hours |

### 3.2 SLA Deadline Calculation

When a ticket is created:

```python
def calculate_sla_deadline(ticket):
    policy = ticket.sla_policy
    if policy.business_hours_only:
        deadline = add_business_hours(now(), policy.first_response_time)
    else:
        deadline = now() + policy.first_response_time
    ticket.sla_deadline = deadline
    ticket.save()
```

### 3.3 SLA Breach Detection

**File:** `crm_backend/apps/tickets/tasks.py`

A periodic Celery task checks for SLA breaches:

1. Finds tickets where `sla_deadline` has passed
2. Status is still `open` or `in_progress`
3. No `first_response_at` set (for response SLA)
4. No `resolved_at` set (for resolution SLA)

When a breach is detected:

- Ticket flagged as `sla_breached`
- WebSocket notification to supervisor
- Escalation email sent (if configured)

### 3.4 SLA Visual Indicators

Frontend shows SLA status:

| Status | Visual |
|---|---|
| On track | Green |
| Approaching deadline (< 1hr) | Yellow |
| Breached | Red |

---

## Phase 4: Ticket Assignment

### 4.1 Manual Assignment

Supervisors and agents can assign or reassign tickets:

**API:** `PATCH /api/tickets/{id}/assign/`

```json
{
  "assigned_to": "uuid-of-agent"
}
```

### 4.2 Auto-Assignment

Tickets can be auto-assigned based on:

| Rule | Description |
|---|---|
| Round-robin | Distribute evenly among team |
| Category-based | Assign to agents skilled in category |
| Customer-based | Assign to customer's dedicated agent |
| Load-based | Assign to agent with fewest open tickets |

### 4.3 Assignment Notifications

When a ticket is assigned:

1. WebSocket event `ticket_assigned` sent to agent
2. Notification badge updates
3. Ticket appears in agent's "My Tickets" queue

---

## Phase 5: Ticket Response

### 5.1 Adding a Reply

Agents add replies to tickets:

| Field | Description |
|---|---|
| `body` | Reply content |
| `is_internal` | Internal note (not visible to customer) |
| `attachments` | File attachments |

**API:** `POST /api/tickets/{id}/replies/`

### 5.2 First Response Tracking

When the first reply is added:

1. `first_response_at` is set to current timestamp
2. Response SLA is marked as met
3. Ticket status may auto-transition to `in_progress`

### 5.3 Internal Notes

Internal notes are:

- Visible only to agents and supervisors
- Not included in customer communications
- Used for team collaboration
- Logged in the ticket timeline

---

## Phase 6: Ticket Resolution

### 6.1 Resolving a Ticket

Agent marks a ticket as resolved:

**API:** `PATCH /api/tickets/{id}/resolve/`

```json
{
  "resolution_notes": "Issue was caused by X, resolved by Y"
}
```

The backend:

1. Updates `status` to `"resolved"`
2. Sets `resolved_at` to current timestamp
3. Sets `resolution_notes`
4. Sends notification to customer (if configured)
5. Starts auto-close timer (e.g., 48 hours)

### 6.2 Auto-Close

If the customer does not respond within the auto-close window:

1. Celery task checks for resolved tickets past the window
2. Status auto-transitions to `"closed"`
3. `closed_at` is set
4. Customer is notified of closure

### 6.3 Reopening

Customer or agent can reopen a resolved ticket:

1. Status changes to `"reopened"`
2. New SLA clock may start (configurable)
3. Assigned agent is notified

---

## Phase 7: Ticket Closure

### 7.1 Manual Closure

Supervisors can manually close tickets:

**API:** `PATCH /api/tickets/{id}/close/`

```json
{
  "closure_notes": "Customer confirmed issue is resolved"
}
```

### 7.2 Closure Validation

Before closing, the system validates:

- Resolution notes are present
- Customer has been notified
- All required fields are filled

### 7.3 Post-Closure

After closure:

1. Ticket is locked (no further replies)
2. Customer satisfaction survey may be sent
3. Ticket data feeds into reporting

---

## Phase 8: Ticket Events (Audit Trail)

### 8.1 Event Types

Every significant action creates a ticket event:

| Event Type | Trigger |
|---|---|
| `created` | Ticket is created |
| `assigned` | Ticket assigned to agent |
| `status_changed` | Status updated |
| `priority_changed` | Priority updated |
| `reply_added` | Reply posted |
| `internal_note` | Internal note added |
| `resolved` | Ticket resolved |
| `closed` | Ticket closed |
| `reopened` | Ticket reopened |
| `sla_breached` | SLA deadline passed |
| `escalated` | Ticket escalated to supervisor |

### 8.2 Ticket Timeline

The ticket detail page shows a chronological timeline of all events, similar to the lead timeline.

**API:** `GET /api/tickets/{id}/events/`

---

## Sequence Diagram

```
Source          Frontend            Backend API         Ticket Service      Database        SLA Monitor     Agent
  │                 │                    │                  │                  │                │              │
  │──Create────────>│                    │                  │                  │                │              │
  │  (call/manual)  │                    │                  │                  │                │              │
  │                 │──POST /tickets/───>│                  │                  │                │              │
  │                 │                    │──create_ticket──>│                  │                │              │
  │                 │                    │                  │──INSERT Ticket──>│                │              │
  │                 │                    │                  │──Calc SLA───────>│                │              │
  │                 │                    │                  │──INSERT Event───>│                │              │
  │                 │<──201 Created─────│                  │                  │                │              │
  │                 │                    │                  │                  │                │              │
  │                 │                    │                  │                  │                │──SLA check──>│
  │                 │                    │                  │                  │                │  (periodic)   │
  │                 │                    │                  │                  │                │              │
  │                 │──Add Reply────────>│                  │                  │                │              │
  │                 │                    │──POST reply─────>│                  │                │              │
  │                 │                    │                  │──Set first_resp─>│                │              │
  │                 │<──201 Created─────│                  │                  │                │              │
  │                 │                    │                  │                  │                │              │
  │                 │──Resolve──────────>│                  │                  │                │              │
  │                 │                    │──PATCH resolve──>│                  │                │              │
  │                 │                    │                  │──UPDATE status──>│                │              │
  │                 │<──200 OK──────────│                  │                  │                │              │
  │                 │                    │                  │                  │                │              │
  │                 │                    │                  │                  │                │──Auto-close─>│
  │                 │                    │                  │                  │──UPDATE closed│              │
```

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| Ticket Models | `crm_backend/apps/tickets/models.py` | Ticket, TicketReply, SLAPolicy models |
| Ticket Views | `crm_backend/apps/tickets/views.py` | Ticket API endpoints |
| Ticket Tasks | `crm_backend/apps/tickets/tasks.py` | SLA breach detection |
| Ticket Services | `crm_backend/apps/tickets/services.py` | Ticket business logic |
| Call Services | `crm_backend/apps/calls/services.py` | Creates tickets from dispositions |
| Ticket Helpers | `crm_frontend/src/lib/helpers/ticketHelpers.ts` | Frontend ticket utilities |
| Ticket Hooks | `crm_frontend/src/hooks/useTickets.ts` | React query hooks for tickets |
| Ticket Detail | `crm_frontend/src/components/tickets/` | Ticket detail components |
| Ticket Types | `crm_frontend/src/types/index.ts` | TypeScript type definitions |
