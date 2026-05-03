# Lead Lifecycle

## Overview

This document describes the complete lifecycle of a lead in the HMDM CRM system, from creation through the sales pipeline to closure (won or lost). Leads represent potential sales opportunities that agents track, nurture, and convert.

---

## Phase 1: Lead Creation

### 1.1 Creation Sources

Leads can originate from multiple sources:

| Source | Trigger | Description |
|---|---|---|
| **Manual** | Agent creates via UI | Agent manually enters lead details at `/leads/new` |
| **Inbound Call** | Disposition action `create_lead` | Auto-created from customer after a call disposition |
| **Campaign** | Campaign list import | Leads imported from campaign contact lists |
| **Outbound Call** | Agent creates during call | Agent creates lead while on an outbound call |
| **Referral** | Existing customer referral | Referral from an existing customer |
| **Website** | Web form submission | Lead captured from website contact form |

### 1.2 Manual Creation

**File:** `crm_frontend/src/app/(dashboard)/leads/new/page.tsx`

Agent fills out the lead creation form:

| Field | Required | Description |
|---|---|---|
| `customer` | Yes | Existing customer or new customer details |
| `title` | Yes | Lead title/description |
| `source` | Yes | How the lead was acquired |
| `priority` | No | Lead priority (Low, Medium, High, Urgent) |
| `assigned_to` | No | Agent to assign (defaults to creator) |
| `campaign` | No | Associated campaign |
| `expected_value` | No | Estimated deal value |
| `notes` | No | Initial notes |

**API:** `POST /api/leads/`

### 1.3 Auto-Creation from Call Disposition

**File:** `crm_backend/apps/calls/services.py`

When a disposition with `create_lead` action is submitted:

```python
def _create_lead(call, action):
    Lead.objects.create(
        customer=call.customer,
        title=f"Lead from call on {call.start_time.date()}",
        source="inbound_call",
        stage=action.target_stage or LeadStage.get_default(),
        assigned_to=call.agent,
        call=call,
        priority="medium",
    )
```

The lead is automatically:
- Linked to the customer from the call
- Assigned to the agent who handled the call
- Placed in the configured default or target stage
- Linked back to the originating call

### 1.4 Campaign Import

Leads can be bulk-imported from campaign lists:

1. Upload CSV/Excel file with contact data
2. System deduplicates against existing customers
3. New customers are created for unknown contacts
4. Leads are created and assigned per campaign rules
5. Campaign assignment is set automatically

---

## Phase 2: Lead Initialization

### 2.1 Lead Record Creation

**File:** `crm_backend/apps/leads/models.py`

A `Lead` record is created with:

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `customer` | FK to the associated customer |
| `title` | Lead title/description |
| `stage` | FK to current pipeline stage |
| `status` | FK to lead status (active, on_hold, etc.) |
| `priority` | FK to priority level |
| `assigned_to` | FK to assigned agent |
| `source` | Lead source (inbound_call, campaign, etc.) |
| `expected_value` | Estimated deal value |
| `won_amount` | Actual won amount (null until won) |
| `lost_reason` | Reason for loss (null until lost) |
| `campaign` | FK to associated campaign |
| `originating_call` | FK to the call that created this lead |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |

### 2.2 Lead Event Logged

**File:** `crm_backend/apps/leads/models.py`

A `LeadEvent` record is automatically created:

| Field | Value |
|---|---|
| `lead` | FK to the new lead |
| `event_type` | `"created"` |
| `description` | "Lead created" |
| `created_by` | FK to the creating user |
| `metadata` | JSON with creation details |

### 2.3 Notification Sent

If the lead is assigned to an agent other than the creator:

1. WebSocket event `lead_assigned` is sent
2. Target agent receives notification
3. Lead appears in the agent's "My Leads" view

---

## Phase 3: Pipeline Stages

### 3.1 Default Pipeline

**File:** `crm_backend/apps/leads/models.py`

The default pipeline stages are:

| Order | Stage Name | Color | Flags |
|---|---|---|---|
| 1 | New | Blue | Default starting stage |
| 2 | Attempted Contact | Gray | |
| 3 | Contacted | Yellow | |
| 4 | Qualified | Purple | |
| 5 | Interested | Orange | |
| 6 | Quotation Sent | Cyan | |
| 7 | Negotiation | Pink | |
| 8 | Ready to Close | Green | |
| 9 | Won | Green | `is_won=True` |
| 10 | Lost | Red | `is_closed=True` |

### 3.2 Customizable Stages

**File:** `crm_frontend/src/components/settings/PipelineStagesSettings.tsx`

Administrators can customize the pipeline:

- Add, remove, reorder stages
- Change stage names and colors
- Mark stages as `is_won` or `is_closed`
- Set default starting stage
- Configure stage-specific requirements

### 3.3 Stage Properties

Each `LeadStage` has:

| Field | Description |
|---|---|
| `name` | Display name |
| `color` | Hex color for UI |
| `order` | Sort order in pipeline |
| `is_won` | Marks this as a won/closed-won stage |
| `is_closed` | Marks this as a terminal stage |
| `required_fields` | Fields required to enter this stage |

---

## Phase 4: Lead Progression

### 4.1 Manual Stage Change

**File:** `crm_backend/apps/leads/views.py`

Agents can move leads through the pipeline:

**API:** `PATCH /api/leads/{id}/move-stage/`

```json
{
  "stage_id": "uuid-of-target-stage"
}
```

The service validates:

1. Stage exists and belongs to the same pipeline
2. Required fields are filled (e.g., `won_amount` for won stage)
3. Agent has permission to modify the lead

### 4.2 Drag-and-Drop (Kanban)

**File:** `crm_frontend/src/app/(dashboard)/leads/pipeline/page.tsx`

The Kanban board allows drag-and-drop:

1. Agent drags a lead card from one column to another
2. Frontend calls `PATCH /api/leads/{id}/move-stage/`
3. Backend validates and updates
4. LeadEvent logged: `"stage_changed"`
5. WebSocket notification sent to relevant users

### 4.3 Auto Stage Change from Disposition

**File:** `crm_backend/apps/calls/services.py`

When a disposition has `change_lead_stage` action:

```python
def _change_lead_stage(call, action):
    lead = Lead.objects.filter(customer=call.customer, is_closed=False).first()
    if lead:
        lead.stage = action.target_stage
        lead.save()
        LeadEvent.objects.create(
            lead=lead,
            event_type="stage_changed",
            description=f"Stage changed via disposition: {action.disposition.name}",
        )
```

### 4.4 Stage Validation Rules

| Rule | Enforcement |
|---|---|
| Won stage requires `won_amount` | Backend validation error if missing |
| Lost stage requires `lost_reason` | Backend validation error if missing |
| Cannot move from closed stage | Backend validation error |
| Cannot skip required stages | Configurable per pipeline |

---

## Phase 5: Lead Interaction

### 5.1 Calls on Leads

Every call to a lead's customer is tracked:

- Inbound and outbound calls are linked to the lead
- Call history visible on the lead detail page
- Disposition actions can auto-advance lead stage
- Call notes are visible in the lead timeline

### 5.2 Notes

**File:** `crm_backend/apps/notes/`

Agents can add notes to leads:

- Free-text notes with timestamps
- Linked to the agent who created them
- Visible in the lead's activity timeline
- Searchable across all leads

### 5.3 Follow-Ups

**File:** `crm_backend/apps/followups/`

Follow-ups can be scheduled on leads:

| Field | Description |
|---|---|
| `lead` | FK to the lead |
| `scheduled_at` | When to follow up |
| `notes` | Follow-up instructions |
| `status` | Pending, Completed, Overdue |
| `completed_at` | When follow-up was completed |

**Reminder flow:**

1. Celery Beat runs `send_followup_reminders` periodically
2. Finds follow-ups due within the next 15 minutes
3. Sends WebSocket reminder to assigned agent
4. Frontend shows `ReminderToast` notification
5. Agent can mark follow-up as completed

### 5.4 Tasks

**File:** `crm_backend/apps/tasks/`

Tasks can be created and assigned on leads:

- Task title, description, due date
- Assigned to specific agent
- Priority and status tracking
- Linked to lead in the activity timeline

---

## Phase 6: Lead Assignment

### 6.1 Manual Assignment

**File:** `crm_backend/apps/leads/views.py`

**API:** `PATCH /api/leads/{id}/assign/`

```json
{
  "assigned_to": "uuid-of-agent"
}
```

Supervisors and admins can reassign leads:

1. LeadEvent logged: `"assigned"`
2. WebSocket notification sent to new assignee
3. Lead appears in the new agent's queue

### 6.2 Auto-Assignment Rules

Leads can be auto-assigned based on:

| Rule | Description |
|---|---|
| Round-robin | Distribute evenly among team members |
| Campaign owner | Assign to campaign owner |
| Call handler | Assign to agent who handled the originating call |
| Skill-based | Assign based on agent skills/queues |

### 6.3 Assignment Notifications

When a lead is assigned:

1. WebSocket event `lead_assigned` sent to the agent
2. Notification badge updates on the leads menu item
3. Lead appears at the top of "My Leads" list

---

## Phase 7: Lead Status Management

### 7.1 Lead Statuses

**File:** `crm_backend/apps/leads/models.py`

| Status | Description |
|---|---|
| `active` | Lead is being actively worked |
| `on_hold` | Lead is paused (waiting on customer) |
| `nurturing` | Long-term lead, periodic contact |
| `converted` | Lead converted to customer/account |
| `won` | Deal closed successfully |
| `lost` | Deal lost |

### 7.2 Status Change

**API:** `PATCH /api/leads/{id}/`

Status changes are tracked:

1. LeadEvent logged: `"status_changed"`
2. Previous and new status recorded in metadata
3. If status becomes `won` or `lost`, lead is considered closed

### 7.3 Closed Lead Rules

When a lead reaches a closed state:

| Rule | Description |
|---|---|
| No further stage changes | Lead is locked in the pipeline |
| Won requires `won_amount` | Actual revenue amount |
| Lost requires `lost_reason` | Reason for loss (dropdown + notes) |
| Notifications sent | Team notified of win/loss |
| Reporting updated | Win/loss metrics updated |

---

## Phase 8: Lead Won

### 8.1 Moving to Won Stage

**File:** `crm_backend/apps/leads/services.py`

When a lead is moved to a won stage:

1. **Validation:**
   - `won_amount` must be provided
   - Lead must not already be closed

2. **Updates:**
   - `status` set to `"won"`
   - `won_amount` set to the deal value
   - `closed_at` timestamp set
   - `closed_by` set to the closing agent

3. **LeadEvent logged:**
   - Event type: `"won"`
   - Includes won_amount in metadata

4. **Notifications:**
   - WebSocket event to team/supervisors
   - Celebration notification (optional)

### 8.2 Post-Win Actions

After a lead is won:

| Action | Description |
|---|---|
| Contract creation | Option to generate a contract |
| Quotation conversion | Convert quotation to invoice |
| Customer update | Update customer record with win info |
| Commission tracking | Track agent commission |
| Reporting | Update win rate, revenue metrics |

### 8.3 Disposition Auto-Win

**File:** `crm_backend/apps/calls/services.py`

When a disposition has `mark_won` action:

```python
def _mark_won(call, action):
    lead = Lead.objects.filter(customer=call.customer, is_closed=False).first()
    if lead:
        lead.status = "won"
        lead.stage = action.target_stage  # Won stage
        lead.won_amount = action.amount or lead.expected_value
        lead.closed_at = timezone.now()
        lead.save()
        LeadEvent.objects.create(
            lead=lead,
            event_type="won",
            description=f"Marked won via disposition: {action.disposition.name}",
        )
```

---

## Phase 9: Lead Lost

### 9.1 Moving to Lost Stage

**File:** `crm_backend/apps/leads/services.py`

When a lead is moved to a lost stage:

1. **Validation:**
   - `lost_reason` must be provided
   - Lead must not already be closed

2. **Updates:**
   - `status` set to `"lost"`
   - `lost_reason` set (from predefined reasons + notes)
   - `closed_at` timestamp set
   - `closed_by` set to the closing agent

3. **LeadEvent logged:**
   - Event type: `"lost"`
   - Includes lost_reason in metadata

4. **Notifications:**
   - WebSocket event to supervisors
   - Supervisor can review and potentially reopen

### 9.2 Lost Reasons

Predefined lost reasons (configurable):

| Reason | Description |
|---|---|
| `price` | Price too high |
| `competitor` | Chose a competitor |
| `timing` | Bad timing, not ready |
| `no_response` | Unresponsive |
| `not_a_fit` | Product/service not a fit |
| `other` | Other (with notes) |

### 9.3 Lost Lead Analysis

Lost leads feed into reporting:

- Loss reason analytics
- Win/loss ratio by agent, team, product
- Average time to loss
- Stage where leads are most commonly lost

---

## Phase 10: Lead Events (Audit Trail)

### 10.1 Event Types

**File:** `crm_backend/apps/leads/models.py`

Every significant action on a lead creates a `LeadEvent`:

| Event Type | Trigger |
|---|---|
| `created` | Lead is created |
| `stage_changed` | Lead moved to different stage |
| `status_changed` | Lead status updated |
| `assigned` | Lead assigned to agent |
| `followup_set` | Follow-up scheduled |
| `won` | Lead marked as won |
| `lost` | Lead marked as lost |
| `note` | Note added to lead |
| `call_logged` | Call associated with lead |
| `ticket_created` | Ticket linked to lead |
| `quotation_sent` | Quotation sent to lead |

### 10.2 Event Structure

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `lead` | FK to the lead |
| `event_type` | Type of event |
| `description` | Human-readable description |
| `created_by` | FK to user who triggered the event |
| `metadata` | JSON with event-specific data |
| `created_at` | Timestamp |

### 10.3 Event Timeline

**File:** `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx`

The lead detail page displays a chronological timeline:

- All events shown in reverse chronological order
- Different icons/colors per event type
- Clickable events for more details
- Filterable by event type

**API:** `GET /api/leads/{id}/events/`

---

## Phase 11: Lead Reporting & Analytics

### 11.1 Pipeline Metrics

**File:** `crm_backend/apps/reports/`

| Metric | Description |
|---|---|
| Total leads | Count of all leads |
| Leads by stage | Distribution across pipeline |
| Conversion rate | % of leads that become won |
| Average time in stage | How long leads stay in each stage |
| Win rate | % of closed leads that are won |
| Average deal size | Mean won_amount |
| Revenue pipeline | Sum of expected_value for active leads |

### 11.2 Agent Performance

| Metric | Description |
|---|---|
| Leads assigned | Total leads assigned to agent |
| Leads won | Number of wins |
| Win rate | Agent's win percentage |
| Average time to close | Mean days from creation to close |
| Revenue generated | Total won_amount |

### 11.3 Source Analysis

| Metric | Description |
|---|---|
| Leads by source | Distribution by acquisition channel |
| Conversion by source | Which sources produce the best leads |
| Cost per lead | If campaign cost is tracked |
| ROI by source | Revenue vs. cost by source |

---

## Sequence Diagram

```
Source          Frontend            Backend API         Lead Service        Database        WebSocket       Agent
  │                 │                    │                  │                  │                │              │
  │──Create────────>│                    │                  │                  │                │              │
  │  (call/form)    │──POST /leads/─────>│                  │                  │                │              │
  │                 │                    │──create_lead()──>│                  │                │              │
  │                 │                    │                  │──INSERT Lead────>│                │              │
  │                 │                    │                  │──INSERT Event───>│                │              │
  │                 │                    │                  │                  │                │              │
  │                 │                    │<─────────────────│──Lead created────│                │              │
  │                 │<──201 Created─────│                  │                  │                │              │
  │                 │                    │                  │──notify_assign──>│                │              │
  │                 │                    │                  │                  │──WS event─────>│              │
  │                 │                    │                  │                  │                │──Notification│
  │                 │                    │                  │                  │                │              │
  │                 │──Move Stage───────>│                  │                  │                │              │
  │                 │  (drag-drop)       │                  │                  │                │              │
  │                 │                    │──move_stage()───>│                  │                │              │
  │                 │                    │                  │──validate────────│                │              │
  │                 │                    │                  │──UPDATE stage───>│                │              │
  │                 │                    │                  │──INSERT Event───>│                │              │
  │                 │<──200 OK──────────│                  │                  │                │              │
  │                 │                    │                  │                  │                │              │
  │                 │──[Repeat: calls,  │                  │                  │                │              │
  │                 │   notes, followups]                  │                  │                │              │
  │                 │                    │                  │                  │                │              │
  │                 │──Mark Won────────>│                  │                  │                │              │
  │                 │                    │──move_stage()───>│                  │                │              │
  │                 │                    │                  │──validate amount─│                │              │
  │                 │                    │                  │──UPDATE status──>│                │              │
  │                 │                    │                  │──UPDATE won_amt─>│                │              │
  │                 │                    │                  │──INSERT Event───>│                │              │
  │                 │<──200 OK──────────│                  │                  │                │              │
  │                 │                    │                  │──notify_team────>│                │              │
  │                 │                    │                  │                  │──WS event─────>│              │
```

---

## Lead Lifecycle States

```
                    ┌─────────────┐
                    │   CREATED   │
                    │   (New)     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  ATTEMPTED  │
                    │  CONTACT    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  CONTACTED  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  QUALIFIED  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ INTERESTED  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ QUOTATION   │
                    │    SENT     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │NEGOTIATION  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  READY TO   │
                    │   CLOSE     │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐          ┌──────▼──────┐
       │    WON      │          │    LOST     │
       │  (Closed)   │          │  (Closed)   │
       └─────────────┘          └─────────────┘
```

---

## Error Handling

### Validation Errors

| Error | Cause | Response |
|---|---|---|
| Missing won_amount | Moving to won stage without amount | 400 Bad Request |
| Missing lost_reason | Moving to lost stage without reason | 400 Bad Request |
| Invalid stage | Stage doesn't exist or wrong pipeline | 400 Bad Request |
| Closed lead modification | Trying to modify a closed lead | 403 Forbidden |
| Permission denied | Agent doesn't have access to lead | 403 Forbidden |

### Concurrency

- Optimistic locking via `updated_at` timestamp
- Last write wins for stage changes
- LeadEvent log provides audit trail for conflicts

### Data Integrity

- Soft deletes not used; leads are never deleted
- Closed leads are immutable (except by admin)
- All changes logged in LeadEvent for audit

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| Lead Models | `crm_backend/apps/leads/models.py` | Lead, LeadStage, LeadStatus, LeadPriority, LeadEvent |
| Lead Services | `crm_backend/apps/leads/services.py` | create_lead, assign_lead, update_lead_stage, update_lead_status |
| Lead Views | `crm_backend/apps/leads/views.py` | LeadViewSet with assign, move-stage, events actions |
| Lead URLs | `crm_backend/apps/leads/urls.py` | Lead API routes |
| Pipeline Settings | `crm_frontend/src/components/settings/PipelineStagesSettings.tsx` | Stage configuration UI |
| Kanban Board | `crm_frontend/src/app/(dashboard)/leads/pipeline/page.tsx` | Drag-and-drop pipeline view |
| Lead List | `crm_frontend/src/app/(dashboard)/leads/page.tsx` | Lead list/table view |
| Lead Detail | `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx` | Lead detail with timeline |
| Lead API Client | `crm_frontend/src/lib/api/leads.ts` | Frontend API client for leads |
| Lead Types | `crm_frontend/src/types/index.ts` | TypeScript type definitions |
| Call Services | `crm_backend/apps/calls/services.py` | Disposition actions that affect leads |
| Followup Models | `crm_backend/apps/followups/models.py` | Follow-up scheduling on leads |
| Notes App | `crm_backend/apps/notes/` | Notes on leads |
| Reports App | `crm_backend/apps/reports/` | Lead analytics and reporting |
