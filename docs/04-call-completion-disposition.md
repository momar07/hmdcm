# Call Completion & Disposition System

## Overview

After every answered call, agents **must** complete the call by selecting a disposition, writing a note, and choosing a next action. This enforcement ensures no call data is lost and every interaction leads to a concrete follow-up.

---

## Core Models

### Disposition

Predefined call outcomes that agents select after a call:

```python
class Disposition(BaseModel):
    name      = CharField(max_length=100)       # "Interested", "Not Interested", "Callback"
    code      = CharField(max_length=50, unique=True)  # "interested", "not_interested"
    color     = CharField(max_length=20)         # For UI badges
    direction = CharField(choices=['inbound', 'outbound', 'both'])
    requires_note = BooleanField(default=True)   # Force agent to write notes
    is_active = BooleanField(default=True)
    order     = PositiveIntegerField(default=0)
```

**Legacy fields** (kept for backward compatibility):
- `requires_followup` — superseded by `DispositionAction`
- `default_next_action` — superseded by `DispositionAction`

**File:** `crm_backend/apps/calls/models.py:6-31`

### DispositionAction

Each disposition can trigger multiple automatic actions:

```python
class DispositionAction(BaseModel):
    disposition = ForeignKey(Disposition, related_name='actions')
    action_type = CharField(choices=[
        ('no_action',       'No Action'),
        ('create_followup', 'Create Follow-up'),
        ('create_lead',     'Create Lead'),
        ('create_ticket',   'Create Ticket'),
        ('change_lead_stage', 'Change Lead Stage'),
        ('mark_won',        'Mark Lead as Won'),
        ('escalate',        'Escalate to Supervisor'),
    ])
    config = JSONField(default=dict, blank=True)  # Action-specific configuration
    order  = PositiveIntegerField(default=0)
```

**File:** `crm_backend/apps/calls/models.py:34-57`

### CallCompletion

The enforcement record created when an agent completes a call:

```python
class CallCompletion(BaseModel):
    call        = OneToOneField(Call)           # The completed call
    disposition = ForeignKey(Disposition)       # Selected outcome
    note        = TextField()                    # Agent's notes
    next_action = CharField(choices=[
        ('callback',       'Schedule Callback'),
        ('send_quotation', 'Send Quotation'),
        ('followup_later', 'Follow-up Later'),
        ('close_lead',     'Close Lead'),
        ('no_action',      'No Action Required'),
    ])

    # Follow-up details
    followup_required = BooleanField(default=False)
    followup_due_at   = DateTimeField(null=True, blank=True)
    followup_assigned = ForeignKey(User, null=True)
    followup_type     = CharField(max_length=50, blank=True)
    followup_created  = ForeignKey(Followup, null=True)  # The actual follow-up created

    # Lead stage change
    lead_stage_updated = BooleanField(default=False)
    new_lead_stage     = ForeignKey(LeadStage, null=True)

    # Audit
    submitted_by = ForeignKey(User, null=True)
    submitted_at = DateTimeField(auto_now_add=True)
```

**File:** `crm_backend/apps/calls/models.py:116-162`

---

## Call Completion Flow

### Step 1: Agent Opens Completion Form

Triggered when:
- Call status changes to `answered` and then to a terminal state
- Or agent manually opens pending completions list

The frontend fetches pending completions:

```python
get_pending_completions(agent=None) -> QuerySet[Call]
```

- Supervisors/admins see **all** pending calls
- Agents see only **their own** pending calls

**File:** `crm_backend/apps/calls/services.py:258-267`

### Step 2: Validation Rules

The `complete_call()` service enforces 8 validation rules:

| # | Rule | Error Message |
|---|---|---|
| 1 | Call must be `status='answered'` | "Only answered calls can be completed." |
| 2 | Call must not already be completed | "Call is already completed." |
| 3 | `disposition_id` is required | "Disposition is required." |
| 4 | Note required if disposition requires it (min 10 chars) | "Note is required..." / "Note must be at least 10 characters." |
| 5 | `next_action` is required and valid | "Next action is required." |
| 6 | Follow-up date required if disposition has `create_followup` action | "Follow-up due date is required..." |
| 7 | Lead must be linked if `next_action='close_lead'` | "Cannot close lead: no lead is linked..." |
| 8 | Won amount required for Won stage; Lost reason for Lost stage | "Won amount is required..." / "Lost reason is required..." |

**File:** `crm_backend/apps/calls/services.py:7-90`

### Step 3: Record Creation

After validation passes:

1. **Create `CallCompletion`:**
   ```python
   CallCompletion.objects.create(
       call=call,
       disposition=disposition,
       note=note,
       next_action=next_action,
       followup_required=followup_required,
       followup_due_at=followup_due_at,
       followup_assigned=assigned_user,
       followup_type=followup_type,
       lead_stage_updated=bool(new_stage_id),
       new_lead_stage_id=new_stage_id,
       submitted_by=agent,
   )
   ```

2. **Update `Call`:**
   ```python
   call.is_completed = True
   call.completed_at = timezone.now()
   call.save()
   ```

3. **Update `Lead` (if linked and stage changed):**
   ```python
   lead.stage_id = new_stage_id
   if stage.is_won:
       lead.won_amount = data.get('won_amount')
       lead.won_at = timezone.now()
   elif stage.slug == 'lost':
       lead.lost_reason = data.get('lost_reason')
       lead.lost_at = timezone.now()
   lead.save()
   ```

**File:** `crm_backend/apps/calls/services.py:92-135`

### Step 4: Execute Disposition Actions

Each `DispositionAction` linked to the selected disposition is executed in order:

#### `create_followup`

Creates a `Followup` record:

```python
Followup.objects.create(
    lead=call.lead,
    call=call,
    assigned_to=assigned_user,
    title=f'Follow-up: {disposition.name}',
    description=note,
    followup_type=followup_type or 'call',
    scheduled_at=scheduled,
    status='pending',
)
```

Links the follow-up back to the completion: `completion.followup_created = followup`

**File:** `crm_backend/apps/calls/services.py:146-161`

#### `create_lead`

Auto-creates a lead from the call's customer (if no lead is linked):

```python
Lead.objects.create(
    title=f'Lead from call — {customer.get_full_name()}',
    customer=customer,
    assigned_to=agent,
    source='call',
    stage_id=cfg.get('default_stage'),  # from action.config
    description=note,
)
call.lead = lead
call.save()
```

**File:** `crm_backend/apps/calls/services.py:164-179`

#### `create_ticket`

Creates a support ticket for the customer:

```python
Ticket.objects.create(
    title=f'Ticket from call — {customer.get_full_name()}',
    customer=customer,
    assigned_to=agent,
    priority=cfg.get('default_priority', 'medium'),
    description=note,
    source='call',
)
```

**File:** `crm_backend/apps/calls/services.py:182-193`

#### `mark_won`

Sets the lead to Won stage:

```python
won_stage = LeadStage.objects.filter(is_won=True, is_active=True).first()
if won_stage:
    call.lead.stage = won_stage
    call.lead.won_at = timezone.now()
    call.lead.won_amount = data.get('won_amount') or call.lead.won_amount
    call.lead.save()
```

**File:** `crm_backend/apps/calls/services.py:196-205`

#### `escalate`

Sends a WebSocket event to supervisors:

```python
channel_layer.group_send('supervisors', {
    'type': 'send_event',
    'event_type': 'escalation',
    'call_id': str(call.id),
    'agent_name': agent.name,
    'note': note,
    'disposition': disposition.name,
})
```

**File:** `crm_backend/apps/calls/services.py:208-222`

#### `change_lead_stage`

Moves lead to a configured stage:

```python
stage_id = data.get('new_lead_stage_id') or action.config.get('stage_id')
stage = LeadStage.objects.get(pk=stage_id)
call.lead.stage = stage
if stage.is_won:
    call.lead.won_at = timezone.now()
call.lead.save()
```

**File:** `crm_backend/apps/calls/services.py:225-237`

### Step 5: Legacy Fallback

If no `DispositionAction` records exist and `followup_required` is True (legacy field), a follow-up is created as a fallback:

```python
if not disp_actions.exists() and followup_required and assigned_user:
    Followup.objects.create(...)
```

**File:** `crm_backend/apps/calls/services.py:240-253`

---

## Next Action Choices

The `next_action` field on `CallCompletion` indicates what the agent plans to do:

| Choice | Description |
|---|---|
| `callback` | Schedule a callback with the customer |
| `send_quotation` | Prepare and send a quotation |
| `followup_later` | Follow up at a later time |
| `close_lead` | Close the lead (won or lost) |
| `no_action` | No further action needed |

---

## Example: Disposition Configuration

### "Interested — Needs Follow-up"

```python
disposition = Disposition.objects.create(
    name='Interested',
    code='interested',
    color='#10b981',
    direction='both',
    requires_note=True,
)

DispositionAction.objects.create(
    disposition=disposition,
    action_type='create_followup',
    config={'default_type': 'call'},
    order=1,
)

DispositionAction.objects.create(
    disposition=disposition,
    action_type='change_lead_stage',
    config={'stage_id': <interested_stage_id>},
    order=2,
)
```

### "Not Interested — Close"

```python
disposition = Disposition.objects.create(
    name='Not Interested',
    code='not_interested',
    color='#ef4444',
    direction='both',
    requires_note=True,
)

DispositionAction.objects.create(
    disposition=disposition,
    action_type='change_lead_stage',
    config={'stage_id': <lost_stage_id>},
    order=1,
)
```

### "Escalate to Supervisor"

```python
disposition = Disposition.objects.create(
    name='Escalation Required',
    code='escalate',
    color='#f59e0b',
    direction='both',
    requires_note=True,
)

DispositionAction.objects.create(
    disposition=disposition,
    action_type='escalate',
    order=1,
)
```

---

## Key Files

| File | Purpose |
|---|---|
| `calls/models.py` | Disposition, DispositionAction, CallCompletion models |
| `calls/services.py` | `complete_call()`, `get_pending_completions()` |
| `calls/serializers.py` | API serializers for completion |
| `calls/views.py` | API endpoints for completion |
| `calls/permissions.py` | Access control for completion |

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/calls/pending-completions/` | List calls needing completion |
| `POST` | `/api/calls/<id>/complete/` | Submit call completion |
| `GET` | `/api/dispositions/` | List available dispositions |
| `POST` | `/api/dispositions/` | Create disposition (admin) |
| `PUT` | `/api/dispositions/<id>/` | Update disposition (admin) |
