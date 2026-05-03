# Follow-Up Lifecycle

## Overview

This document describes the complete lifecycle of follow-ups in the HMDM CRM system. Follow-ups are scheduled reminders that ensure agents follow through on commitments made during calls, lead interactions, and customer engagements.

---

## Phase 1: Follow-Up Creation

### 1.1 Creation Sources

Follow-ups can be created from:

| Source | Trigger | Description |
|---|---|---|
| **Call Disposition** | Disposition action `create_followup` | Auto-created after call disposition |
| **Manual** | Agent creates via UI | Agent schedules follow-up on lead/customer |
| **Lead Detail** | Follow-up button on lead page | Quick follow-up scheduling |
| **Customer Detail** | Follow-up button on customer page | Schedule callback |
| **Task** | Task with due date | Task-based follow-up |

### 1.2 Creation via Call Disposition

**File:** `crm_backend/apps/calls/services.py`

When a disposition has `create_followup` action:

```python
def _create_followup(call, action):
    Followup.objects.create(
        customer=call.customer,
        lead=call.lead,
        agent=call.agent,
        scheduled_at=action.followup_datetime,
        notes=action.followup_notes or f"Follow up from call: {call.disposition.name}",
        status="pending",
        created_by=call.agent,
    )
```

The agent selects the follow-up date/time in the disposition modal.

### 1.3 Manual Creation

Agent creates a follow-up from a lead or customer detail page:

| Field | Required | Description |
|---|---|---|
| `scheduled_at` | Yes | Date and time for follow-up |
| `notes` | No | Instructions or context |
| `lead` | No | Associated lead |
| `customer` | No | Associated customer |
| `priority` | No | Follow-up priority |

**API:** `POST /api/followups/`

---

## Phase 2: Follow-Up Scheduling

### 2.1 Follow-Up Record

**File:** `crm_backend/apps/followups/models.py`

| Field | Description |
|---|---|
| `id` | UUID primary key |
| `customer` | FK to associated customer |
| `lead` | FK to associated lead |
| `agent` | FK to assigned agent |
| `scheduled_at` | When to follow up |
| `notes` | Follow-up instructions |
| `status` | Pending, Completed, Overdue, Skipped |
| `completed_at` | When follow-up was completed |
| `completed_by` | FK to agent who completed it |
| `created_by` | FK to user who created it |
| `created_at` | Creation timestamp |

### 2.2 Follow-Up States

| Status | Description |
|---|---|
| `pending` | Scheduled, not yet due |
| `due` | Due now (within reminder window) |
| `overdue` | Past due date, not completed |
| `completed` | Successfully completed |
| `skipped` | Skipped/cancelled |

---

## Phase 3: Reminder System

### 3.1 Celery Beat Scheduler

**File:** `crm_backend/config/celery.py`

Celery Beat runs periodic tasks:

```python
beat_schedule = {
    "send-followup-reminders": {
        "task": "apps.followups.tasks.send_followup_reminders",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
}
```

### 3.2 Reminder Task

**File:** `crm_backend/apps/followups/tasks.py`

The `send_followup_reminders` task:

1. **Queries for due follow-ups:**

```python
now = timezone.now()
window_start = now
window_end = now + timedelta(minutes=15)

due_followups = Followup.objects.filter(
    status="pending",
    scheduled_at__gte=window_start,
    scheduled_at__lte=window_end,
)
```

2. **Updates status to `due`:**

```python
for followup in due_followups:
    followup.status = "due"
    followup.save()
```

3. **Sends WebSocket reminders:**

```python
for followup in due_followups:
    channel_layer.group_send(
        f"agent_{followup.agent.id}",
        {
            "type": "followup_reminder",
            "followup": serialize_followup(followup),
        },
    )
```

### 3.3 Frontend Reminder Toast

**File:** `crm_frontend/src/components/followups/ReminderToast.tsx`

When the WebSocket hook receives a `followup_reminder` event:

1. Toast notification appears
2. Shows follow-up details (customer, lead, notes, scheduled time)
3. Action buttons:
   - **Call Now** → Initiates outbound call
   - **Snooze** → Delay reminder by 5/15/30 minutes
   - **Complete** → Mark as completed
   - **Skip** → Mark as skipped

---

## Phase 4: Follow-Up Execution

### 4.1 Agent Acts on Follow-Up

The agent can act on a follow-up in several ways:

| Action | Result |
|---|---|
| **Call Now** | Opens softphone with customer number pre-filled |
| **View Lead** | Navigates to the associated lead detail page |
| **View Customer** | Navigates to the associated customer detail page |

### 4.2 Completing a Follow-Up

**API:** `PATCH /api/followups/{id}/complete/`

```json
{
  "notes": "Called back, customer interested in product X"
}
```

The backend:

1. Updates `status` to `"completed"`
2. Sets `completed_at` to current timestamp
3. Sets `completed_by` to the completing agent
4. Creates a note on the associated lead/customer

### 4.3 Skipping a Follow-Up

**API:** `PATCH /api/followups/{id}/skip/`

```json
{
  "reason": "Customer requested no further contact"
}
```

The backend:

1. Updates `status` to `"skipped"`
2. Records the skip reason
3. No further reminders will be sent

---

## Phase 5: Overdue Follow-Ups

### 5.1 Overdue Detection

Follow-ups become overdue when:

- `scheduled_at` has passed
- `status` is still `pending` or `due`
- No completion or skip action has been taken

### 5.2 Overdue Notifications

Overdue follow-ups are flagged:

1. Visual indicator in the follow-up list (red badge)
2. Included in daily summary report to supervisors
3. Agent dashboard shows count of overdue follow-ups

### 5.3 Supervisor Escalation

If a follow-up is overdue by more than a configurable threshold:

1. WebSocket event sent to supervisor group
2. Supervisor can reassign or escalate
3. Appears in supervisor dashboard as "At Risk"

---

## Phase 6: Follow-Up Reporting

### 6.1 Follow-Up Metrics

| Metric | Description |
|---|---|
| Total follow-ups | Count of all follow-ups |
| Completion rate | % of follow-ups completed on time |
| Overdue rate | % of follow-ups that became overdue |
| Average time to complete | Mean time from scheduled to completed |
| Follow-ups by agent | Distribution across agents |
| Follow-ups by source | Created via disposition vs. manual |

### 6.2 Agent Performance

Follow-up compliance is a key performance indicator:

- High completion rate → Reliable agent
- High overdue rate → Needs coaching
- Skip rate → May indicate poor lead quality

---

## Sequence Diagram

```
Disposition     Backend API         Database        Celery Beat       WebSocket       Frontend
     │               │                 │                │                │               │
     │──Create──────>│                 │                │                │               │
     │  (followup)   │                 │                │                │               │
     │               │──INSERT────────>│                │                │               │
     │               │  Followup       │                │                │               │
     │               │                 │                │                │               │
     │               │                 │                │──Every 5 min───│               │
     │               │                 │                │                │               │
     │               │                 │<──Query due────│                │               │
     │               │                 │                │                │               │
     │               │                 │──UPDATE status─│                │               │
     │               │                 │  to "due"      │                │               │
     │               │                 │                │                │               │
     │               │                 │                │──WS event─────>│               │
     │               │                 │                │                │──Toast───────>│
     │               │                 │                │                │               │
     │               │                 │                │                │  [Agent sees] │
     │               │                 │                │                │               │
     │               │<──Complete──────│                │                │               │
     │               │                 │──UPDATE────────│                │               │
     │               │                 │  status=done    │                │               │
     │               │<──200 OK────────│                │                │               │
     │               │                 │                │                │──Toast closes │
```

---

## Key Files Reference

| Layer | File | Purpose |
|---|---|---|
| Followup Models | `crm_backend/apps/followups/models.py` | Followup model |
| Followup Tasks | `crm_backend/apps/followups/tasks.py` | send_followup_reminders |
| Followup Views | `crm_backend/apps/followups/views.py` | Followup API endpoints |
| Celery Config | `crm_backend/config/celery.py` | Beat schedule for reminders |
| Reminder Toast | `crm_frontend/src/components/followups/ReminderToast.tsx` | Follow-up notification UI |
| WebSocket Hook | `crm_frontend/src/lib/websocket/useWebSocket.ts` | Receives followup_reminder events |
| Call Services | `crm_backend/apps/calls/services.py` | Creates follow-ups from dispositions |
| ASGI | `crm_backend/config/asgi.py` | Followup reminder scheduler thread |
