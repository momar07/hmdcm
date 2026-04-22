# ✅ HMDCM — Lead-First Checklist
> ضع `x` جوا الـ `[ ]` لما تخلص كل task
> مثال: `- [ ]` ← `- [x]`

---

## 📊 Progress

| Sprint | المهام | مكتمل |
|--------|--------|--------|
| Sprint 1 — Models & Migration | 8 | 0 |
| Sprint 2 — Services & APIs | 14 | 1 |
| Sprint 3 — Frontend | 16 | 3 |
| Sprint 4 — Testing & Cleanup | 9 | 1 |
| **الإجمالي** | **47** | **0** |

---

---

## 🏃 Sprint 1 — Models & Database

### leads/models.py
- [x] `[1.1]`
- [x] `[1.2]`
- [x] `[1.3]`
- [x] `[1.4]`

### Database
- [x] `[1.5]` 🔴 `python manage.py makemigrations leads --name lead_customer_optional_and_conversion_fields`
- [x] `[1.6]` 🔴 مراجعة الـ migration file قبل التطبيق
- [x] `[1.7]` 🔴 `python manage.py migrate`
- [x] `[1.8]` 🔴 التأكد إن الـ data القديمة لسه شغالة بعد الـ migration

---

## 🏃 Sprint 2 — Services & APIs

### leads/services.py
- [x] `[2.1]` 🔴 إضافة دالة `convert_lead_to_customer()`
- [x] `[2.2]` 🔴 إضافة دالة `mark_won()` تستدعي التحويل أوتوماتيك
- [x] `[2.3]` 🔴 إضافة دالة `mark_lost()`
- [x] `[2.4]` 🔴 تعديل `create_lead()` يشتغل بدون Customer

### leads/views.py
- [x] `[2.5]` 🔴 إضافة action `mark-won` — `POST /api/leads/{id}/mark-won/`
- [x] `[2.6]` 🔴 إضافة action `mark-lost` — `POST /api/leads/{id}/mark-lost/`
- [x] `[2.7]` 🟡 إضافة action `timeline` — `GET /api/leads/{id}/timeline/`

### calls/services.py
- [x] `[2.8]` 🔴 `find_lead_by_phone()` — Screen Pop يدور على Lead مش Customer
- [x] `[2.9]` 🔴 `get_or_create_lead_for_call()` — ينشئ Lead جديد لو مفيش

### leads/serializers.py
- [x] `[2.10]` 🟡 إضافة `converted_to_customer` و `converted_at` و `customer_id` للـ `LeadDetailSerializer`
- [x] `[2.11]` 🟡 إنشاء `LeadCreateSerializer` بدون Customer field

### customers/views.py
- [x] `[2.12]` 🟡 `CustomerHistoryView` يعرض الـ Lead الأصلي في الـ timeline
- [x] `[2.13]` 🟡 إضافة endpoint `GET /api/customers/{id}/lead/`
- [x] `[2.14]` 🟢 `get_all_customers()` يرجع بس الـ Leads اللي `lifecycle_stage=customer`

---

## 🏃 Sprint 3 — Frontend

### Dashboard
- [x] `[3.1]` 🔴 الـ Dashboard الرئيسي يبدأ بـ Lead Pipeline مش Customer List
- [x] `[3.2]` 🔴 إضافة Stats (Leads نشطة / WON / LOST / محتاجة followup)

### صفحة Lead
- [x] `[3.3]` 🔴 فورم إنشاء Lead جديد بدون Customer field
- [x] `[3.4]` 🔴 Kanban Board لمراحل الـ Pipeline
- [x] `[3.5]` 🔴 صفحة تفاصيل Lead تعرض البيانات + Timeline
- [x] `[3.6]` 🔴 زرار **Mark as WON** مع فورم `won_amount`
- [x] `[3.7]` 🔴 زرار **Mark as LOST** مع فورم `lost_reason`
- [x] `[3.8]` 🟡 عرض Lead Score بشكل visual (progress bar + badge)
- [x] `[3.9]` 🟡 Drag & Drop بين مراحل الـ Pipeline

### صفحة Customer
- [x] `[3.10]` 🔴 Customer List يعرض بس الـ Leads المحولين (WON)
- [x] `[3.11]` 🔴 صفحة تفاصيل Customer تعرض link للـ Lead الأصلي
- [x] `[3.12]` 🟡 إزالة أو إخفاء فورم "إنشاء Customer يدوي"

### Screen Pop
- [x] `[3.13]` 🔴 Screen Pop يفتح Lead مش Customer
- [x] `[3.14]` 🟡 بعد المكالمة — أزرار سريعة (Followup / Task / تحديث المرحلة)

### Navigation
- [x] `[3.15]` 🟡 تحديث الـ Sidebar — Leads أول حاجة
- [x] `[3.16]` 🟢 فلتر على Lead List (lifecycle / classification / source)

---

## 🏃 Sprint 4 — Testing & Cleanup

### Backend Tests
- [x] `[4.1]` 🔴 اختبار `convert_lead_to_customer()`
- [x] `[4.2]` 🔴 اختبار `mark_won()`
- [x] `[4.3]` 🔴 اختبار `mark_lost()`
- [x] `[4.4]` 🔴 اختبار `find_lead_by_phone()`

### API Tests
- [x] `[4.5]` 🔴 اختبار `POST /api/leads/` بدون `customer_id`
- [x] `[4.6]` 🔴 اختبار `POST /api/leads/{id}/mark-won/`
- [x] `[4.7]` 🟡 اختبار `GET /api/leads/{id}/timeline/`

### Cleanup
- [x] `[4.8]` 🟡 حذف أي كود بيجبر Customer قبل Lead
- [x] `[4.9]` 🟢 تحديث الـ Swagger Docs — `/api/docs/`

---

## 🔑 Legend
| رمز | معناه |
|-----|--------|
| `- [x]` | لسه |
| `- [x]` | ✅ خلصت |
| 🔴 | Critical — لازم يتعمل |
| 🟡 | Medium — مهم |
| 🟢 | Nice to Have |
