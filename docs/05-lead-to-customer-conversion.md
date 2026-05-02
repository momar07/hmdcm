# Lead-to-Customer Conversion

## Overview

In this CRM system, **Lead is the primary entity**. A `Customer` record is created **only after** a Lead is marked as WON. This design ensures that the sales pipeline operates on leads, and only qualified, closed-won deals become customers.

---

## Conversion Trigger

Conversion is triggered automatically when:

1. **`mark_won()` is called** — either directly or via the API
2. **Call completion with Won stage** — agent selects a Won stage during call completion
3. **DispositionAction `mark_won`** — disposition auto-marks lead as won

---

## Conversion Flow

### Step 1: Mark Lead as Won

```python
mark_won(lead_id, won_amount=None, actor=None) -> {lead, customer}
```

**What happens:**

1. Lock the lead row (`select_for_update`)
2. Find the Won stage (`LeadStage.objects.filter(is_won=True, is_active=True).first()`)
3. Update lead fields:
   - `won_at = timezone.now()`
   - `won_amount = won_amount or lead.value`
   - `stage = won_stage`
   - `is_active = True`
4. Create audit event: `LeadEvent(event_type='won')`

**File:** `crm_backend/apps/leads/services.py:130-163`

### Step 2: Convert to Customer

Immediately after marking won, `convert_lead_to_customer()` is called:

```python
convert_lead_to_customer(lead_id, actor=None) -> Customer
```

**What happens:**

1. **Idempotency check:** If already converted, return existing customer
   ```python
   if lead.converted_to_customer and lead.customer_id:
       return lead.customer
   ```

2. **Create Customer** from lead data:
   ```python
   Customer.objects.create(
       first_name  = lead.first_name,
       last_name   = lead.last_name,
       email       = lead.email,
       company     = lead.company,
       address     = lead.address,
       city        = lead.city,
       country     = lead.country or 'Egypt',
       source      = lead.source,
       assigned_to = lead.assigned_to,
       notes       = f'Converted from Lead: {lead.title}',
       is_active   = True,
   )
   ```

3. **Create CustomerPhone** from lead phone:
   ```python
   CustomerPhone.objects.create(
       customer   = customer,
       number     = lead.phone,
       phone_type = 'mobile',
       is_primary = True,
       is_active  = True,
   )
   ```
   > Silently fails if phone already exists or is invalid.

4. **Link lead to customer:**
   ```python
   lead.customer             = customer
   lead.converted_to_customer = True
   lead.converted_at         = timezone.now()
   lead.lifecycle_stage      = 'customer'
   lead.save()
   ```

5. **Create audit event:**
   ```python
   LeadEvent.objects.create(
       lead       = lead,
       event_type = 'stage_changed',
       actor      = actor,
       old_value  = 'opportunity',
       new_value  = 'customer',
       note       = f'Converted to Customer ID: {customer.id}',
   )
   ```

**File:** `crm_backend/apps/leads/services.py:60-124`

---

## Data Mapping: Lead → Customer

| Lead Field | Customer Field | Notes |
|---|---|---|
| `first_name` | `first_name` | Direct copy |
| `last_name` | `last_name` | Direct copy |
| `email` | `email` | Direct copy |
| `phone` | `CustomerPhone.number` | Created as separate record |
| `company` | `company` | Direct copy |
| `address` | `address` | Direct copy |
| `city` | `city` | Direct copy |
| `country` | `country` | Defaults to 'Egypt' |
| `source` | `source` | Direct copy |
| `assigned_to` | `assigned_to` | Direct copy |
| `title` | — | Stored in `notes` as "Converted from Lead: {title}" |
| `description` | — | Not transferred |
| `value` | — | Stored as `won_amount` on lead |

---

## Lead State After Conversion

After conversion, the lead record is **not deleted** — it remains as a historical record:

| Field | Value After Conversion |
|---|---|
| `customer` | Linked to new Customer |
| `converted_to_customer` | `True` |
| `converted_at` | Timestamp of conversion |
| `lifecycle_stage` | `'customer'` |
| `stage` | Won stage |
| `won_at` | Timestamp of won |
| `won_amount` | Deal value |
| `is_active` | `True` |

---

## Conversion via Call Completion

When an agent completes a call and selects a Won stage:

1. `complete_call()` updates the lead stage
2. If `stage.is_won`:
   ```python
   lead.won_amount = data.get('won_amount')
   lead.won_at     = timezone.now()
   lead.save()
   ```
3. **Note:** Call completion does NOT automatically call `convert_lead_to_customer()`. The conversion must be triggered separately or via the `mark_won()` service.

> **Gap identified:** Call completion sets `won_at` and `won_amount` but does not trigger `convert_lead_to_customer()`. Consider adding this call to the disposition action `mark_won` or after stage change to Won.

**File:** `crm_backend/apps/calls/services.py:122-135`

---

## Conversion via DispositionAction `mark_won`

The `mark_won` disposition action:

```python
elif atype == 'mark_won':
    if call.lead:
        won_stage = LeadStage.objects.filter(is_won=True, is_active=True).first()
        if won_stage:
            call.lead.stage    = won_stage
            call.lead.won_at   = timezone.now()
            call.lead.won_amount = data.get('won_amount') or call.lead.won_amount
            call.lead.save()
```

> **Same gap:** This also does NOT call `convert_lead_to_customer()`.

**File:** `crm_backend/apps/calls/services.py:196-205`

---

## Idempotency

The conversion is idempotent — calling it multiple times on the same lead returns the existing customer without creating duplicates:

```python
if lead.converted_to_customer and lead.customer_id:
    return lead.customer
```

---

## Customer Model Reference

The `Customer` model (in `apps/customers/models.py`) stores:
- Contact information (name, email, company, address)
- Phones via `CustomerPhone` (one-to-many)
- Assignment (`assigned_to`)
- Source tracking
- Activity history via related calls, leads, tickets, etc.

---

## Key Services

| Function | File | Purpose |
|---|---|---|
| `mark_won` | `leads/services.py:131` | Mark lead as won + trigger conversion |
| `convert_lead_to_customer` | `leads/services.py:61` | Create customer from lead data |
| `complete_call` | `calls/services.py:7` | Can set won stage but does NOT convert |

---

## Recommended Improvement

To ensure consistency, consider modifying the `mark_won` disposition action in `calls/services.py` to also call `convert_lead_to_customer()`:

```python
elif atype == 'mark_won':
    if call.lead:
        won_stage = LeadStage.objects.filter(is_won=True, is_active=True).first()
        if won_stage:
            call.lead.stage    = won_stage
            call.lead.won_at   = timezone.now()
            call.lead.won_amount = data.get('won_amount') or call.lead.won_amount
            call.lead.save()
            # Add this:
            from apps.leads.services import convert_lead_to_customer
            convert_lead_to_customer(call.lead.id, actor=agent)
```

Similarly for the stage-change-to-won path in `complete_call()`.
