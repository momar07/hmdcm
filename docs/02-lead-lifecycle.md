# Lead Lifecycle

## Overview

This document describes the complete lifecycle of a Lead from creation through the sales pipeline to either Won (conversion to Customer) or Lost (closed).

**Core Principle:** Lead is the primary entity. A `Customer` is created **only after** a Lead is marked as WON.

---

## Phase 1: Lead Creation

### 1.1 Creation Sources

Leads can be created from multiple sources:

| Source | Trigger | Code Path |
|---|---|---|
| `manual` | User creates via UI | `leads/services.py:create_lead()` |
| `call` | Inbound call with no existing lead | `calls/services.py:get_or_create_lead_for_call()` |
| `campaign` | Campaign enrollment | Campaign module |
| `referral` | Referral from existing customer | Manual or API |
| `web` | Website form submission | Integration/webhook |
| `other` | Import, API, etc. | Various |

**File:** `crm_backend/apps/leads/models.py:77-84`

### 1.2 Service: `create_lead()`

```python
create_lead(data: dict, actor=None) -> Lead
```

**What it does:**
1. Creates `Lead` with all provided fields
2. Sets `lifecycle_stage = 'lead'` (default)
3. Sets `classification = 'none'` (default)
4. Sets `score = 0` (default)
5. Creates a `LeadEvent` with `event_type = 'created'`

**Required fields:** None explicitly enforced, but `title` is expected.

**File:** `crm_backend/apps/leads/services.py:14-54`

### 1.3 Auto-Creation from Call

When an inbound call arrives and no matching lead exists:

```python
get_or_create_lead_for_call(phone_number, direction, agent, caller_name)
    ├── find_lead_by_phone(phone_number)  # exact → normalized → suffix
    └── create_lead(...)  # if not found
```

- Title auto-generated: `"Lead from {direction} call - {phone_number}"`
- Source set to `'call'`
- Assigned to the handling agent
- Name parsed from `caller_name` if provided

**File:** `crm_backend/apps/calls/services.py:312-345`

---

## Phase 2: Pipeline Stages

### 2.1 Stage Definitions

The sales pipeline is configurable via `LeadStage` model:

| Stage (slug) | Name | is_closed | is_won |
|---|---|---|---|
| `new` | New | No | No |
| `attempted_contact` | Attempted Contact | No | No |
| `contacted` | Contacted | No | No |
| `qualified` | Qualified | No | No |
| `interested` | Interested | No | No |
| `quotation_sent` | Quotation Sent | No | No |
| `negotiation` | Negotiation | No | No |
| `ready_to_close` | Ready to Close | No | No |
| `won` | Won | **Yes** | **Yes** |
| `lost` | Lost | **Yes** | No |

**File:** `crm_backend/apps/leads/models.py:6-46`

### 2.2 Stage Transitions

```python
move_stage(lead_id, stage_id, actor=None) -> Lead
```

**What it does:**
1. Validates lead and stage exist
2. Updates `lead.stage`
3. Creates `LeadEvent` with `event_type = 'stage_changed'`

**Alias:** `update_lead_stage()` — same function

**File:** `crm_backend/apps/leads/services.py:206-225`

### 2.3 Stage Change via Call Completion

When an agent completes a call, they can change the lead stage:

1. Agent selects a `new_lead_stage_id` in the completion form
2. `complete_call()` updates `lead.stage`
3. If stage is `is_won`: sets `won_amount` and `won_at`
4. If stage is `lost`: sets `lost_reason` and `lost_at`

**File:** `crm_backend/apps/calls/services.py:122-135`

---

## Phase 3: Lead Status & Priority

### 3.1 Lead Status

Separate from pipeline stages, `LeadStatus` provides additional state tracking:

- Customizable via admin
- Has `is_closed` flag
- Has `color` for UI display

**File:** `crm_backend/apps/leads/models.py:49-61`

### 3.2 Lead Priority

`LeadPriority` model for ranking leads:

- Configurable via admin
- Ordered by `order` field

**File:** `crm_backend/apps/leads/models.py:64-73`

### 3.3 Status Update Service

```python
update_lead_status(lead_id, status_id, actor=None) -> Lead
```

Creates a `LeadEvent` with `event_type = 'status_changed'`.

**File:** `crm_backend/apps/leads/services.py:359-378`

### 3.4 Assignment Service

```python
assign_lead(lead_id, user_id, actor=None) -> Lead
```

Creates a `LeadEvent` with `event_type = 'assigned'`.

**File:** `crm_backend/apps/leads/services.py:332-353`

---

## Phase 4: Lifecycle Stages (CRM Maturity)

Beyond pipeline stages, each lead has a `lifecycle_stage` representing its maturity:

| Stage | Description |
|---|---|
| `lead` | Raw, unqualified contact |
| `prospect` | Engaged, showing interest |
| `opportunity` | Active sales process underway |
| `customer` | Converted after WON |
| `churned` | Former customer, no longer active |

**File:** `crm_backend/apps/leads/models.py:134-140`

---

## Phase 5: Lead Scoring & Classification

### 5.1 Scoring System

Each lead has a `score` (0-100) that accumulates based on interactions:

| Event | Points |
|---|---|
| `call_long` (> 3 min) | +10 |
| `call_short` (< 3 min) | +5 |
| `call_no_answer` | -5 |
| `followup_responded` | +15 |
| `followup_missed` | -10 |
| `quotation_sent` | +20 |
| `quotation_accepted` | +25 |
| `quotation_rejected` | -15 |
| `profile_complete` | +10 |
| `time_decay` (7 days) | -5 |
| `time_decay` (14 days) | -10 |
| `time_decay` (30 days) | -20 |
| `manual` | 0 (custom) |

**File:** `crm_backend/apps/leads/scoring.py:6-18`

### 5.2 Classification Thresholds

Score automatically maps to classification:

| Score Range | Classification |
|---|---|
| 86-100 | `very_hot` |
| 61-85 | `hot` |
| 31-60 | `warm` |
| 1-30 | `cold` |
| 0 | `none` |

**File:** `crm_backend/apps/leads/scoring.py:21-26`

### 5.3 Scoring Service

```python
add_score_event(lead, event_type, points=None, reason='') -> Lead
```

- Creates `ScoreEvent` record
- Clamps score to 0-100 range
- Auto-updates `classification`

**File:** `crm_backend/apps/leads/scoring.py:29-48`

### 5.4 Time Decay

```python
apply_time_decay(lead) -> Lead
```

Runs daily via Celery. Checks last contact date (answered call or completed followup):

| Days Without Contact | Penalty |
|---|---|
| 7+ | -5 |
| 14+ | -10 |
| 30+ | -20 |

**File:** `crm_backend/apps/leads/scoring.py:69-109`

---

## Phase 6: Follow-ups

### 6.1 Follow-up Creation

Follow-ups can be created:
1. **Manually** via UI
2. **Automatically** via `DispositionAction` with `create_followup` during call completion

### 6.2 Follow-up Reminders

```python
send_followup_reminders()  # runs every minute via Celery beat
```

Finds follow-ups due within the next 15 minutes and pushes WebSocket notifications to the assigned agent.

**File:** `crm_backend/apps/calls/tasks.py:467-562`

---

## Phase 7: Won — Lead to Customer Conversion

### 7.1 Mark Won

```python
mark_won(lead_id, won_amount=None, actor=None) -> {lead, customer}
```

**What it does:**
1. Finds the Won stage (`is_won=True`)
2. Sets `lead.won_at`, `lead.won_amount`, `lead.stage`
3. Creates `LeadEvent` with `event_type = 'won'`
4. **Calls `convert_lead_to_customer()`** — see Phase 8

**File:** `crm_backend/apps/leads/services.py:130-163`

### 7.2 Won via Call Completion

When completing a call with a disposition that has `mark_won` action:
1. Finds Won stage automatically
2. Updates lead stage and `won_at`
3. Sets `won_amount` from form data

**File:** `crm_backend/apps/calls/services.py:196-205`

---

## Phase 8: Lead → Customer Conversion

### 8.1 Service: `convert_lead_to_customer()`

```python
convert_lead_to_customer(lead_id, actor=None) -> Customer
```

**What it does:**
1. Checks if already converted → return existing customer
2. Creates `Customer` from lead data (name, email, company, address, etc.)
3. Creates `CustomerPhone` from lead phone
4. Links `lead.customer = customer`
5. Sets `lead.converted_to_customer = True`, `lead.converted_at = now`
6. Updates `lead.lifecycle_stage = 'customer'`
7. Creates `LeadEvent` with `event_type = 'stage_changed'`

**File:** `crm_backend/apps/leads/services.py:60-124`

---

## Phase 9: Lost — Lead Closure

### 9.1 Mark Lost

```python
mark_lost(lead_id, lost_reason='', actor=None) -> Lead
```

**What it does:**
1. Finds the Lost stage (`is_closed=True, is_won=False`)
2. Sets `lead.lost_at`, `lead.lost_reason`, `lead.stage`
3. Sets `lead.is_active = False`
4. Creates `LeadEvent` with `event_type = 'lost'`

**File:** `crm_backend/apps/leads/services.py:169-200`

### 9.2 Lost via Call Completion

When completing a call and selecting a Lost stage:
- `lost_reason` is enforced as required
- `lost_at` is set automatically

**File:** `crm_backend/apps/calls/services.py:86-89`

---

## Phase 10: Lead Timeline

### 10.1 Timeline Aggregation

```python
get_lead_timeline(lead_id) -> list[dict]
```

Aggregates all activity into a unified timeline sorted by date (newest first):

| Type | Source |
|---|---|
| `event` | `LeadEvent` (stage changes, assignments, etc.) |
| `call` | `Call` records linked to lead |
| `followup` | `Followup` records |
| `note` | `Note` records |
| `task` | `Task` records |
| `quotation` | `Quotation` records |

**File:** `crm_backend/apps/leads/services.py:231-326`

---

## Lead State Machine

```
                    ┌─────────┐
                    │  CREATE │
                    └────┬────┘
                         ▼
              ┌─────────────────────┐
              │ lifecycle: lead     │
              │ stage: new          │
              │ score: 0            │
              │ classification: none│
              └─────────┬───────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │ Pipeline Progression│
              │ new → attempted →   │
              │ contacted → qualified│
              │ → interested → quote│
              │ → negotiation → close│
              └─────────┬───────────┘
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
     ┌──────────────┐    ┌──────────────┐
     │    WON       │    │    LOST      │
     │ is_won=true  │    │ is_closed=true│
     │ is_closed=true│   │ is_active=false│
     └──────┬───────┘    └──────────────┘
            │
            ▼
     ┌──────────────┐
     │ CONVERT to   │
     │  Customer    │
     │ lifecycle:   │
     │  customer    │
     └──────────────┘
```

---

## Key Models

| Model | File | Purpose |
|---|---|---|
| `Lead` | `leads/models.py:76` | Core lead entity |
| `LeadStage` | `leads/models.py:6` | Pipeline stage definitions |
| `LeadStatus` | `leads/models.py:49` | Additional status tracking |
| `LeadPriority` | `leads/models.py:64` | Priority levels |
| `LeadEvent` | `leads/models.py:183` | Audit trail for lead changes |
| `ScoreEvent` | `leads/models.py:213` | Score change history |
| `Deal` | `deals/models.py:6` | Specific opportunity linked to lead |
| `DealLog` | `deals/models.py:48` | Deal audit trail |

---

## Key Services

| Function | File | Purpose |
|---|---|---|
| `create_lead` | `leads/services.py:14` | Create a new lead |
| `convert_lead_to_customer` | `leads/services.py:61` | Convert won lead to customer |
| `mark_won` | `leads/services.py:131` | Mark lead as won + convert |
| `mark_lost` | `leads/services.py:170` | Mark lead as lost |
| `move_stage` | `leads/services.py:207` | Move lead to new stage |
| `assign_lead` | `leads/services.py:333` | Assign lead to user |
| `update_lead_status` | `leads/services.py:360` | Update lead status |
| `update_lead` | `leads/services.py:419` | General field update |
| `get_lead_timeline` | `leads/services.py:231` | Aggregate activity timeline |
| `add_score_event` | `leads/scoring.py:29` | Add score event + update classification |
| `apply_time_decay` | `leads/scoring.py:69` | Apply inactivity penalty |
