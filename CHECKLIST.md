# ✅ HMDCM — Lead-First Checklist
> ضع `x` جوا الـ `[ ]` لما تخلص كل task
> مثال: `- [ ]` ← `- [x]`

---

## 📊 Progress

| Sprint | المهام | مكتمل |
|--------|--------|--------|
| Sprint 1 — Models & Migration | 8 | 0 |
| Sprint 2 — Services & APIs | 14 | 0 |
| Sprint 3 — Frontend | 16 | 0 |
| Sprint 4 — Testing & Cleanup | 9 | 0 |
| **الإجمالي** | **47** | **0** |

---

---

## 🏃 Sprint 1 — Models & Database

### leads/models.py
- [ ] `[1.1]` 🔴 تغيير `customer` FK من `CASCADE` إلى `SET_NULL, null=True, blank=True`
- [ ] `[1.2]` 🔴 إضافة field `converted_to_customer` (BooleanField, default=False)
- [ ] `[1.3]` 🔴 إضافة field `converted_at` (DateTimeField, null=True)
- [ ] `[1.4]` 🟡 إضافة index على `converted_to_customer` و `lifecycle_stage`

### Database
- [ ] `[1.5]` 🔴 `python manage.py makemigrations leads --name lead_customer_optional_and_conversion_fields`
- [ ] `[1.6]` 🔴 مراجعة الـ migration file قبل التطبيق
- [ ] `[1.7]` 🔴 `python manage.py migrate`
- [ ] `[1.8]` 🔴 التأكد إن الـ data القديمة لسه شغالة بعد الـ migration

---

## 🏃 Sprint 2 — Services & APIs

### leads/services.py
- [ ] `[2.1]` 🔴 إضافة دالة `convert_lead_to_customer()`
- [ ] `[2.2]` 🔴 إضافة دالة `mark_won()` تستدعي التحويل أوتوماتيك
- [ ] `[2.3]` 🔴 إضافة دالة `mark_lost()`
- [ ] `[2.4]` 🔴 تعديل `create_lead()` يشتغل بدون Customer

### leads/views.py
- [ ] `[2.5]` 🔴 إضافة action `mark-won` — `POST /api/leads/{id}/mark-won/`
- [ ] `[2.6]` 🔴 إضافة action `mark-lost` — `POST /api/leads/{id}/mark-lost/`
- [ ] `[2.7]` 🟡 إضافة action `timeline` — `GET /api/leads/{id}/timeline/`

### calls/services.py
- [ ] `[2.8]` 🔴 `find_lead_by_phone()` — Screen Pop يدور على Lead مش Customer
- [ ] `[2.9]` 🔴 `get_or_create_lead_for_call()` — ينشئ Lead جديد لو مفيش

### leads/serializers.py
- [ ] `[2.10]` 🟡 إضافة `converted_to_customer` و `converted_at` و `customer_id` للـ `LeadDetailSerializer`
- [ ] `[2.11]` 🟡 إنشاء `LeadCreateSerializer` بدون Customer field

### customers/views.py
- [ ] `[2.12]` 🟡 `CustomerHistoryView` يعرض الـ Lead الأصلي في الـ timeline
- [ ] `[2.13]` 🟡 إضافة endpoint `GET /api/customers/{id}/lead/`
- [ ] `[2.14]` 🟢 `get_all_customers()` يرجع بس الـ Leads اللي `lifecycle_stage=customer`

---

## 🏃 Sprint 3 — Frontend

### Dashboard
- [ ] `[3.1]` 🔴 الـ Dashboard الرئيسي يبدأ بـ Lead Pipeline مش Customer List
- [ ] `[3.2]` 🔴 إضافة Stats (Leads نشطة / WON / LOST / محتاجة followup)

### صفحة Lead
- [ ] `[3.3]` 🔴 فورم إنشاء Lead جديد بدون Customer field
- [ ] `[3.4]` 🔴 Kanban Board لمراحل الـ Pipeline
- [ ] `[3.5]` 🔴 صفحة تفاصيل Lead تعرض البيانات + Timeline
- [ ] `[3.6]` 🔴 زرار **Mark as WON** مع فورم `won_amount`
- [ ] `[3.7]` 🔴 زرار **Mark as LOST** مع فورم `lost_reason`
- [ ] `[3.8]` 🟡 عرض Lead Score بشكل visual (progress bar + badge)
- [ ] `[3.9]` 🟡 Drag & Drop بين مراحل الـ Pipeline

### صفحة Customer
- [ ] `[3.10]` 🔴 Customer List يعرض بس الـ Leads المحولين (WON)
- [ ] `[3.11]` 🔴 صفحة تفاصيل Customer تعرض link للـ Lead الأصلي
- [ ] `[3.12]` 🟡 إزالة أو إخفاء فورم "إنشاء Customer يدوي"

### Screen Pop
- [ ] `[3.13]` 🔴 Screen Pop يفتح Lead مش Customer
- [ ] `[3.14]` 🟡 بعد المكالمة — أزرار سريعة (Followup / Task / تحديث المرحلة)

### Navigation
- [ ] `[3.15]` 🟡 تحديث الـ Sidebar — Leads أول حاجة
- [ ] `[3.16]` 🟢 فلتر على Lead List (lifecycle / classification / source)

---

## 🏃 Sprint 4 — Testing & Cleanup

### Backend Tests
- [ ] `[4.1]` 🔴 اختبار `convert_lead_to_customer()`
- [ ] `[4.2]` 🔴 اختبار `mark_won()`
- [ ] `[4.3]` 🔴 اختبار `mark_lost()`
- [ ] `[4.4]` 🔴 اختبار `find_lead_by_phone()`

### API Tests
- [ ] `[4.5]` 🔴 اختبار `POST /api/leads/` بدون `customer_id`
- [ ] `[4.6]` 🔴 اختبار `POST /api/leads/{id}/mark-won/`
- [ ] `[4.7]` 🟡 اختبار `GET /api/leads/{id}/timeline/`

### Cleanup
- [ ] `[4.8]` 🟡 حذف أي كود بيجبر Customer قبل Lead
- [ ] `[4.9]` 🟢 تحديث الـ Swagger Docs — `/api/docs/`

---

## 🔑 Legend
| رمز | معناه |
|-----|--------|
| `- [ ]` | لسه |
| `- [x]` | ✅ خلصت |
| 🔴 | Critical — لازم يتعمل |
| 🟡 | Medium — مهم |
| 🟢 | Nice to Have |
