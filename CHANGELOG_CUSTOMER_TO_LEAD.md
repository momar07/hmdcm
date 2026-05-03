# Customer → Lead Migration — Changelog

## Overview
Merged the `Customer` model into `Lead` across the entire CRM codebase. Every caller is now a Lead from the start, eliminating the dual Customer/Lead architecture.

---

## Database Changes

### New Models
- **`LeadTag`** — Replaces `CustomerTag` for tagging leads
  - Fields: `name`, `color`
  - Table: `lead_tags`

### Merged Fields (now on `Lead`)
- `first_name`, `last_name`, `email`
- `gender`, `date_of_birth`
- `company`, `address`, `city`, `country`
- `notes`

### Removed Foreign Keys
- `Call.customer` → removed
- `Ticket.customer` → removed
- `Task.customer` → removed
- `Quotation.customer` → removed
- `ApprovalRequest.customer` → removed
- `Followup.customer` → removed (already lead-based)
- `Lead.customer` → removed
- `Note.customer` → removed
- `AuditLog.customer` → removed
- `CampaignMember.customer` → removed

### Tags Migration
- `Lead.tags` now references `LeadTag` instead of `CustomerTag`
- VIP tagging on won deals uses `LeadTag`

---

## Backend Changes (Django)

### Models
- **`apps/leads/models.py`**: Added `LeadTag` model, merged customer fields into `Lead`, updated `tags` M2M
- **`apps/calls/models.py`**: Removed `customer` FK from `Call`
- **`apps/tickets/models.py`**: Removed `customer` FK, kept `customer_name`/`customer_email` as denormalized snapshot fields (now populated from Lead)

### Serializers
- **`apps/leads/serializers.py`**: Removed `customer_id`, `customer_detail`, `customer_name`. Added `LeadTagSerializer`. Updated fields to include `first_name`, `last_name`, `email`, `company`, `notes`, `tags`
- **`apps/calls/serializers.py`**: `customer_name` → `lead_name`, `customer` → `lead`. Removed `customer_id` from `OriginateCallSerializer`
- **`apps/tasks/serializers.py`**: `customer_name`/`customer_phone` → `lead_name`. Removed `customer` FK fields
- **`apps/tickets/serializers.py`**: `customer_id` → `lead`. `TicketCreateSerializer` now snapshots lead info into `customer_name`/`customer_email`
- **`apps/sales/serializers.py`**: `customer_name` → `lead_name`, removed `customer` FK
- **`apps/approvals/serializers.py`**: `customer`/`customer_name` → `lead`/`lead_name`
- **`apps/followups/serializers.py`**: `customer_id`/`customer_name`/`customer_phone` → `lead_name`/`lead_phone`

### Views
- **`apps/calls/views.py`**: 
  - `CallViewSet`: filters/search updated to use `lead` instead of `customer`
  - `ScreenPopView`: lead-only lookup, removed customer fallback
  - `PendingCompletionsView`: `customer` → `lead`/`lead_name`
  - `StartWebrtcCallView`: removed customer resolution logic
  - Removed `LinkCallToCustomerView` and its URL route
- **`apps/tasks/views.py`**: Removed `customer` filter
- **`apps/tickets/views.py`**: `select_related("customer")` → `select_related("lead")`
- **`apps/sales/views.py`**: `QuotationViewSet` updated to use `lead` filter
- **`apps/followups/views.py`**: `log_action` now resolves lead instead of customer
- **`apps/approvals/views.py`**: WS notification uses `lead_name` instead of `customer_name`

### Services
- **`apps/leads/services.py`**: `create_lead()` no longer takes `customer_id`. `_notify_agent()` uses `lead_name`
- **`apps/calls/services.py`**: VIP tagging uses `LeadTag` instead of `CustomerTag`
- **`apps/sales/services.py`**: `render_terms()` uses `lead_name` (with `customer_name` alias for backwards compat). `submit_for_approval()` no longer passes `customer`

### Tasks (Celery)
- **`apps/calls/tasks.py`**: 
  - `notify_incoming_call`: lead-only payload
  - `send_followup_reminders`: uses lead phone/name instead of customer
  - `handle_missed_call`: uses `call.lead` instead of `call.customer`
  - `handle_vip_call`: uses `call.lead` instead of `call.customer`

### Selectors & Queries
- **`apps/calls/selectors.py`**: All `select_related('customer')` → `select_related('lead')`. `get_calls_by_customer()` → `get_calls_by_lead()`
- **`apps/tickets/queries.py`**: All `select_related("customer")` → `select_related("lead")`. `get_tickets_for_customer()` → `get_tickets_for_lead()`
- **`apps/tickets/filters.py`**: `customer` filter → `lead` filter

### Signals
- **`apps/tickets/signals.py`**: Ticket creation snapshots `lead.get_full_name()` and `lead.email` into `customer_name`/`customer_email`

### URLs
- **`apps/calls/urls.py`**: Removed `LinkCallToCustomerView` route

---

## Frontend Changes (Next.js)

### Types (`src/types/`)
- **`index.ts`**:
  - `Lead`: removed `customer_name`
  - `Call`: `customer`/`customer_name` → `lead`/`lead_name`
  - `Followup`: `customer_id`/`customer_name`/`customer_phone` → `lead_name`/`lead_phone`
  - `Task`: `customer`/`customer_name`/`customer_phone` → `lead_name`
  - `Quotation`: `customer`/`customer_name` → `lead_name`
  - `AdminDashboard`: removed `total_customers`
  - `FollowupReminderEvent`: `customer`/`customer_id`/`customer_phone` → `lead_name`/`lead_phone`
  - Removed `Customer`, `CustomerTag`, `CustomerPhone` interfaces (kept for legacy pages)
- **`tickets.ts`**:
  - `TicketListItem`: `customer_id` → `lead`
  - `TicketDetail`: `customer` → `lead`
  - `TicketCreatePayload`: `customer` → `lead`
  - `TicketFilters`: `customer` → `lead`

### API Layer (`src/lib/api/`)
- **`calls.ts`**: Removed `customer_id` from `originate()`, removed `linkCall()`, updated `startWebrtcCall()` to only take `lead_id`
- **`tasks.ts`**: Removed `customer` from `TaskFilters` and `CreateTaskData`
- **`sales.ts`**: Removed `customer` from `QuotationCreatePayload` and `quotationsApi.list()` params
- **`approvals.ts`**: `ApprovalRequest`: `customer`/`customer_name` → `lead`/`lead_name`. Removed `customer` from `ApprovalCreatePayload`
- **`index.ts`**: Removed `customersApi` export

### Layout & Navigation
- **`layout.tsx`**: DispositionModal props `customerName`/`customerId` → `leadName`/`leadId`
- **`Sidebar.tsx`**: Removed "Customers" nav link

### Calls
- **`calls/page.tsx`**: Table column `customer_name` → `lead_name`. Search placeholder updated
- **`calls/[id]/page.tsx`**: `InfoRow` label "Customer" → "Lead"
- **`DispositionModal.tsx`**: Props `customerName`/`customerId` → `leadName`/`leadId`. UI badge updated. Query invalidation uses `lead-*` keys

### SoftPhone
- **`SoftPhone.tsx`**: `externalDialRef` type changed from `{ phone, customerId, leadId }` → `{ phone, leadId }`. `startWebrtcCall()` no longer sends `customer_id`

### Leads
- **`leads/new/page.tsx`**: Removed customer dropdown. Added `first_name`, `last_name`, `email`, `company` fields. Removed `linkCall` call on success
- **`leads/pipeline/page.tsx`**: `customer_name` → contact info display (first_name + last_name or phone)
- **`leads/[id]/page.tsx`**: Contact info section shows phone, email, name, company directly. Removed linked customer section

### Tasks
- **`tasks/page.tsx`**: `customer_name` → `lead_name`. `handleStart` no longer sends `customer_id`
- **`tasks/[id]/page.tsx`**: Linked records section uses `lead_name` with `/leads/` link
- **`TaskModal.tsx`**: Removed `customerId` prop and customer field. Lead query no longer filters by customer. Submit payload only includes `lead`

### Followups
- **`followups/page.tsx`**: All `customer_name`/`customer_phone` → `lead_name`/`lead_phone`. `handleCall` uses `lead_phone`. Toast message "customer timeline" → "lead timeline"
- **`followups/new/page.tsx`**: Customer dropdown → lead dropdown. Schema uses `lead_id`
- **`followups/[id]/page.tsx`**: Subtitle uses `lead_name`
- **`ReminderToast.tsx`**: Interface updated to `lead_name`/`lead_phone`. UI and dial dispatch updated

### Sales / Quotations
- **`sales/quotations/page.tsx`**: Table column `customer_name` → `lead_name`
- **`sales/quotations/[id]/page.tsx`**: Info card "Customer" → "Lead"
- **`sales/quotations/new/page.tsx`**: Removed `customerId` prop
- **`QuotationBuilder.tsx`**: Removed `customerId` prop and customer dropdown. Only lead select remains. Payload only includes `lead`

### Tickets
- **`NewTicketModal.tsx`**: Customer search → lead search. Props `defaultCustomerId` → `defaultLeadId`. Form uses `lead` field
- **`TicketDetailHeader.tsx`**: Removed `defaultCustomerId` from `NewApprovalModal`
- **`TicketRow.tsx`**: Still displays `customer_name` (denormalized from lead on backend)
- **`TicketInfoPanel.tsx`**: Still displays `customer_name`/`customer_email` (denormalized)

### Approvals
- **`ApprovalCard.tsx`**: `customer_name` → `lead_name`
- **`NewApprovalModal.tsx`**: Removed `defaultCustomerId` prop. Payload no longer includes `customer`

### Settings
- **`DispositionsSettings.tsx`**: `create_lead` action description updated: "Auto-create Lead linked to call" (removed "+ customer")

### Dashboard
- **`dashboard/page.tsx`**: Admin view removed "Total Customers" stat card

### Customer Pages (Legacy — still exist but not linked from nav)
- **`customers/[id]/page.tsx`**: API calls updated to use `lead` filter instead of `customer` where applicable. `NewTicketModal` uses `defaultLeadId`
- **`customers/new/page.tsx`**: Removed `linkCall` on success (endpoint deleted)

---

## Build Verification
- ✅ Django `manage.py check`: no issues
- ✅ Next.js `npm run build`: successful (only pre-existing ESLint warnings)
