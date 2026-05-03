# 🔧 CRM Errors & Troubleshooting Log

---

## 📋 Table of Contents
1. [Lead Classification NOT NULL Error](#1-lead-classification-not-null-error)
2. [Customer ID Column Error on Lead Creation](#2-customer-id-column-error-on-lead-creation)
3. [Ticket Number Sequence Missing](#3-ticket-number-sequence-missing)
4. [Lead Detail Page — Added Tabs](#4-lead-detail-page--added-tabs)
5. [Incoming Call Answer Button Not Working](#5-incoming-call-answer-button-not-working)

---

## 1. Lead Classification NOT NULL Error

### Error
```
django.db.utils.IntegrityError: null value in column "classification" of relation "leads" violates not-null constraint
```
Occurred when creating a Lead from an incoming call (`_get_or_create_lead` in `apps/calls/tasks.py`).

### Root Cause
The PostgreSQL `leads` table had a `classification` column with `NOT NULL` constraint, but the Django `Lead` model didn't define this field. Django's INSERT didn't include it → database rejected the row.

### Fix
Added missing fields to `apps/leads/models.py`:
- `classification` — `CharField(default='none')`
- `lifecycle_stage` — `CharField(default='lead')`
- `score` — `IntegerField(default=0)`
- `converted_to_customer` — `BooleanField(default=False)`
- `converted_at` — `DateTimeField(null=True, blank=True)`

Created migration `0013` using `SeparateDatabaseAndState` because columns already existed in DB.

### Files Changed
- `crm_backend/apps/leads/models.py`
- `crm_backend/apps/leads/migrations/0013_lead_classification_lead_converted_at_and_more.py`

---

## 2. Customer ID Column Error on Lead Creation

### Error
```
ProgrammingError: column "customer_id" of relation "leads" does not exist
LINE 1: ...eads" ("created_at", "updated_at", "id", "title", "customer_...
```

### Root Cause
The Daphne server was running with **stale bytecode** (`__pycache__`). The old process still had the `customer` FK field in its model state, so it tried to INSERT `customer_id` into a column that no longer exists.

### Fix
1. Cleared all `__pycache__` directories and `.pyc` files
2. Restarted Daphne server
3. Removed `customer` from `filterset_fields` in `LeadViewSet` (`apps/leads/views.py`)
4. Removed `customer` from `select_related` in `apps/leads/selectors.py`
5. Removed `customer` from all serializers and views across the codebase

### Files Changed
- `crm_backend/apps/leads/views.py` — removed `customer` from `filterset_fields`
- `crm_backend/apps/leads/selectors.py` — removed `customer` from `select_related`
- `crm_backend/apps/approvals/views.py` — removed `customer` from `select_related`
- `crm_backend/apps/tasks/serializers.py` — removed `customer` from fields
- `crm_backend/apps/auditlog/serializers.py` — removed `customer` from fields
- `crm_backend/apps/campaigns/serializers.py` — changed `customer` → `lead`
- `crm_backend/apps/campaigns/selectors.py` — changed `select_related('customer')` → `select_related('lead')`
- `crm_backend/apps/campaigns/views.py` — changed `select_related('customer')` → `select_related('lead')`
- `crm_backend/apps/notes/views.py` — removed `customer` from `filterset_fields`
- `crm_backend/apps/notes/serializers.py` — removed `customer` from fields
- `crm_backend/apps/integrations/consumers.py` — changed `customer` → `lead_name`
- `crm_backend/apps/integrations/services.py` — replaced all `find_customer_by_phone` with `_find_lead_by_phone`
- `crm_backend/apps/followups/tasks.py` — changed `customer` → `lead_name`

---

## 3. Ticket Number Sequence Missing

### Error
```
django.db.utils.ProgrammingError: relation "ticket_number_seq" does not exist
LINE 1: SELECT nextval('ticket_number_seq')
```

### Root Cause
The `Ticket` model's `save()` method uses a PostgreSQL sequence (`ticket_number_seq`) to auto-generate ticket numbers, but the sequence was never created in the database.

### Fix
Created the sequence manually with the correct start value:
```sql
CREATE SEQUENCE ticket_number_seq START WITH 1 INCREMENT BY 1;
```

### Files Changed
- None (database-only fix)

---

## 4. Lead Detail Page — Added Tabs

### Goal
Transform the lead detail page from a simple single-column layout into a rich tabbed view (like the old customer page) showing all lead-related data.

### Implementation
Rebuilt `src/app/(dashboard)/leads/[id]/page.tsx` with 5 tabs:

| Tab | Data Source | Description |
|-----|-------------|-------------|
| **Activity** | `leadsApi.events(id)` | Lead events timeline (stage changes, status changes, assignments, etc.) |
| **Calls** | `callsApi.list({ lead: id })` | All calls linked to this lead with direction, status, duration |
| **Tickets** | `ticketsApi.list({ lead: id })` | Tickets filtered by lead with priority/status badges |
| **Follow-ups** | `followupsApi.list({ lead: id })` | Follow-ups with status, due dates, assignee |
| **Quotations** | `quotationsApi.list({ lead: id })` | Quotations with status badges, totals |

### Backend Changes
- Added `lead` to `filterset_fields` in `apps/followups/views.py`

### Frontend Changes
- Added `address`, `city`, `country` to `Lead` TypeScript interface in `src/types/index.ts`
- Rebuilt the entire lead detail page with tab navigation, info card, and 5 data tabs

### Files Changed
- `crm_frontend/src/app/(dashboard)/leads/[id]/page.tsx` — complete rewrite
- `crm_frontend/src/types/index.ts` — added `address`, `city`, `country` to `Lead`
- `crm_backend/apps/followups/views.py` — added `lead` to `filterset_fields`

---

## 5. Incoming Call Answer Button Not Working

### Symptoms
- Incoming call popup shows
- Answer button is visible but clicking it does nothing
- No audio, no call state change

### Troubleshooting Steps

#### Step 1: Trace the answer flow
The answer chain is:
1. `IncomingCallPopup.handleAnswer()` → calls `actions?.answer()`
2. `sipStore.actions.answer` → registered by SoftPhone, calls `useSip.answer()`
3. `useSip.answer()` → calls `clientRef.current?.answer()`
4. `SipClient.answer()` → calls `this.session.answer({...})`

#### Step 2: Added logging at every layer
- `[Popup]` — IncomingCallPopup
- `[useSip]` — useSip hook
- `[SIP]` — SipClient

#### Step 3: Identified two issues

**Issue A: Popup showed before SIP session was ready**
- WS event from backend arrived → popup showed
- But SIP WebSocket hadn't connected yet → no session to answer
- **Fix**: Show popup on WS event (original behavior), but disable answer button with warning when SIP isn't ready

**Issue B: SIP connects but `newRTCSession` never fires**
- Logs show: `[SIP] ✅ Registered`
- But when a call comes in: `[Popup] WS event arrived — showing popup (callStatus: idle )`
- `callStatus` stays `idle` — meaning Asterisk is NOT sending the call via WebSocket
- **Root cause**: Extension 300 is configured to use **UDP/TCP transport** instead of **WebSocket (ws/wss)**

### Current Status
✅ SIP WebSocket connects and registers successfully
✅ Backend WS sends incoming call events
✅ Popup shows correctly
❌ **Asterisk does NOT send the call via WebSocket** — `newRTCSession` never fires
❌ Answer button stays disabled because there's no WebRTC session

### Next Steps to Fix
1. **Check Asterisk PJSIP config for extension 300:**
   ```bash
   # Via Asterisk CLI
   asterisk -rx "pjsip show endpoint 300"
   ```
   Look for `transport=` — it should be `transport-ws` or similar WebSocket transport.

2. **If using FreePBX:**
   - Go to **Applications → Extensions → 300**
   - Under **PJSIP Settings → Advanced**
   - Set **Transport** to `ws` or `wss`
   - Apply config

3. **Verify WebSocket transport exists in Asterisk:**
   ```bash
   asterisk -rx "pjsip show transports"
   ```
   Should show a WebSocket transport on port 8088.

4. **Alternative: Add AMI-based answer fallback**
   - If SIP WebSocket can't be used, implement answer via Asterisk Manager Interface (AMI)
   - The popup would send an AMI `Answer` action instead of SIP `session.answer()`

### Files Changed
- `crm_frontend/src/lib/sip/sipClient.ts` — added try/catch around `answer()`, detailed logging
- `crm_frontend/src/lib/sip/useSip.ts` — added null guard, auto-reconnect on failure
- `crm_frontend/src/components/calls/IncomingCallPopup.tsx` — disabled answer button when SIP not ready, warning message, detailed logging

---

## 📌 Notes for Tomorrow
- The main blocker is **Asterisk transport configuration** for extension 300
- All code changes are committed and build successfully
- The popup works, the answer logic works — the missing piece is the WebRTC session from Asterisk
- Check `pjsip.conf` or FreePBX GUI for extension 300 transport setting
