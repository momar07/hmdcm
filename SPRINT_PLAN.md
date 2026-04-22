# ============================================================
# HMDCM — Lead-First Architecture
# خطة تحويل Lead ليبقى الوحدة الرئيسية
# ============================================================

changes = {

    # ════════════════════════════════════════════════════════
    # 1️⃣  leads/models.py — التغيير الأساسي
    # ════════════════════════════════════════════════════════
    "1_leads_model": {
        "title": "leads/models.py — اللي هيتغير",
        "changes": [
            {
                "id": "1.1",
                "what": "Customer FK يبقى اختياري مش إجباري",
                "before": """
customer = models.ForeignKey(
    'customers.Customer',
    on_delete=models.CASCADE,   # ❌ لو الكاستمر اتمسح الليد بيتمسح
    related_name='leads'
)""",
                "after": """
customer = models.ForeignKey(
    'customers.Customer',
    on_delete=models.SET_NULL,  # ✅ لو الكاستمر اتمسح الليد يفضل
    null=True,
    blank=True,
    related_name='leads'
)""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "1.2",
                "what": "إضافة field: converted_to_customer",
                "after": """
# ── Conversion tracking ───────────────────────
converted_to_customer = models.BooleanField(
    default=False,
    help_text='تم تحويله لكاستمر بعد WON'
)
converted_at = models.DateTimeField(
    null=True, blank=True,
    help_text='تاريخ التحويل'
)""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "1.3",
                "what": "إضافة lifecycle_stage = customer عند التحويل",
                "after": """
# lifecycle_stage موجود أصلاً في الكود:
# lead → prospect → opportunity → customer → churned
# بس محتاج يتحدث أوتوماتيك لما Lead يبقى WON
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 2️⃣  leads/services.py — إضافة convert_to_customer
    # ════════════════════════════════════════════════════════
    "2_leads_service": {
        "title": "leads/services.py — دالة التحويل",
        "changes": [
            {
                "id": "2.1",
                "what": "دالة convert_lead_to_customer()",
                "after": """
def convert_lead_to_customer(lead_id: str, actor=None):
    \"\"\"
    لما Lead يبقى WON:
    1. ينشئ Customer من بيانات الـ Lead
    2. يربط الـ Customer بالـ Lead
    3. يحدث lifecycle_stage = 'customer'
    4. يسجل LeadEvent
    \"\"\"
    from apps.customers.models import Customer, CustomerPhone
    from apps.customers.services import create_customer

    lead = Lead.objects.get(pk=lead_id)

    # لو عنده Customer بالفعل — متعملش تاني
    if lead.converted_to_customer and lead.customer:
        return lead.customer

    # إنشاء Customer من بيانات الـ Lead
    customer_data = {
        'first_name':  lead.first_name,
        'last_name':   lead.last_name,
        'email':       lead.email,
        'company':     lead.company,
        'address':     lead.address,
        'city':        lead.city,
        'country':     lead.country,
        'source':      lead.source,
        'assigned_to': lead.assigned_to,
        'phones': [{'number': lead.phone, 'phone_type': 'mobile', 'is_primary': True}]
                   if lead.phone else [],
    }
    customer = create_customer(customer_data)

    # ربط الـ Lead بالـ Customer الجديد
    lead.customer             = customer
    lead.converted_to_customer = True
    lead.converted_at         = now()
    lead.lifecycle_stage      = 'customer'
    lead.save(update_fields=[
        'customer', 'converted_to_customer',
        'converted_at', 'lifecycle_stage'
    ])

    # تسجيل LeadEvent
    LeadEvent.objects.create(
        lead=lead,
        event_type='stage_changed',
        actor=actor,
        old_value='opportunity',
        new_value='customer',
        note=f'Converted to Customer #{customer.id}'
    )

    return customer
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "2.2",
                "what": "تعديل mark_won() تستدعي convert_lead_to_customer أوتوماتيك",
                "after": """
def mark_won(lead_id, won_amount=None, actor=None):
    lead          = Lead.objects.get(pk=lead_id)
    lead.won_amount = won_amount
    lead.won_at   = now()
    lead.lifecycle_stage = 'customer'
    lead.save(update_fields=['won_amount', 'won_at', 'lifecycle_stage'])

    # ✅ التحويل الأوتوماتيك
    customer = convert_lead_to_customer(lead_id, actor=actor)

    LeadEvent.objects.create(
        lead=lead, event_type='won',
        actor=actor,
        new_value=str(won_amount or ''),
    )
    return lead, customer
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 3️⃣  leads/views.py — إضافة action جديد
    # ════════════════════════════════════════════════════════
    "3_leads_views": {
        "title": "leads/views.py — endpoints جديدة",
        "changes": [
            {
                "id": "3.1",
                "what": "action: mark_won — يحول الليد لـ WON ويعمل Customer",
                "after": """
@action(detail=True, methods=['post'], url_path='mark-won')
def mark_won(self, request, pk=None):
    \"\"\"POST /api/leads/{id}/mark-won/\"\"\"
    won_amount = request.data.get('won_amount')
    lead, customer = services.mark_won(
        pk, won_amount=won_amount, actor=request.user
    )
    return Response({
        'detail':      'Lead marked as WON.',
        'customer_id': str(customer.id),
        'lead_id':     str(lead.id),
    })
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "3.2",
                "what": "action: mark_lost — يغلق الليد كـ LOST",
                "after": """
@action(detail=True, methods=['post'], url_path='mark-lost')
def mark_lost(self, request, pk=None):
    \"\"\"POST /api/leads/{id}/mark-lost/\"\"\"
    lost_reason = request.data.get('lost_reason', '')
    lead = services.mark_lost(pk, lost_reason=lost_reason, actor=request.user)
    return Response({'detail': 'Lead marked as LOST.'})
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "3.3",
                "what": "action: timeline — سجل الليد الكامل (زي customer history)",
                "after": """
@action(detail=True, methods=['get'], url_path='timeline')
def timeline(self, request, pk=None):
    \"\"\"GET /api/leads/{id}/timeline/
    calls + notes + followups + tasks + quotations
    \"\"\"
    ...
""",
                "priority": "🟡 Medium",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 4️⃣  calls/models.py — ربط المكالمة بـ Lead مباشرة
    # ════════════════════════════════════════════════════════
    "4_calls_model": {
        "title": "calls/models.py — المكالمة ترتبط بـ Lead مش Customer",
        "changes": [
            {
                "id": "4.1",
                "what": "Lead FK يبقى الأساسي في المكالمة (موجود بالفعل)",
                "note": """
# ✅ موجود بالفعل في الكود:
lead = models.ForeignKey('leads.Lead', null=True, blank=True, ...)

# بس محتاج:
# لما مكالمة تيجي ومفيش Lead — ينشئ Lead جديد أوتوماتيك
# مش ينشئ Customer
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "4.2",
                "what": "Screen Pop يبحث عن Lead بالتليفون مش Customer",
                "after": """
# في calls/selectors.py أو asterisk/
def find_lead_by_phone(phone_number: str):
    \"\"\"Screen pop — بيدور على Lead مش Customer\"\"\"
    from apps.leads.models import Lead
    return Lead.objects.filter(
        phone=phone_number,
        lifecycle_stage__in=['lead', 'prospect', 'opportunity']
    ).first()
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 5️⃣  tasks/models.py — Task يرتبط بـ Lead مباشرة
    # ════════════════════════════════════════════════════════
    "5_tasks_model": {
        "title": "tasks/models.py — Task يشتغل على Lead",
        "changes": [
            {
                "id": "5.1",
                "what": "Lead FK يبقى الأساسي في Task (موجود بالفعل ✅)",
                "note": """
# ✅ موجود بالفعل:
lead = models.ForeignKey('leads.Lead', null=True, blank=True, ...)
# بس customer FK كمان موجود — ده مش مشكلة
# بس الـ UI لازم يعرض Tasks من خلال Lead مش Customer
""",
                "priority": "🟡 Medium",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 6️⃣  quotations/models.py — Quotation يرتبط بـ Lead
    # ════════════════════════════════════════════════════════
    "6_quotations_model": {
        "title": "sales/models.py — Quotation يشتغل على Lead",
        "changes": [
            {
                "id": "6.1",
                "what": "Lead FK موجود بالفعل في Quotation ✅",
                "note": """
# ✅ موجود بالفعل:
lead = models.ForeignKey('leads.Lead', null=True, blank=True, ...)
customer = models.ForeignKey('customers.Customer', null=True, blank=True, ...)

# الـ flow الصح:
# Quotation يتعمل من Lead
# لما Lead يبقى WON → customer field يتحدث أوتوماتيك
""",
                "priority": "🟢 Low",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 7️⃣  Migration — تحديث الـ Database
    # ════════════════════════════════════════════════════════
    "7_migration": {
        "title": "Database Migration",
        "changes": [
            {
                "id": "7.1",
                "what": "عمل migration لتغيير Customer FK في Lead",
                "after": """
# في terminal:
python manage.py makemigrations leads
python manage.py migrate

# ⚠️ تنبيه: لو عندك data موجودة
# لازم تعمل data migration الأول
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "7.2",
                "what": "إضافة fields جديدة: converted_to_customer + converted_at",
                "after": """
python manage.py makemigrations leads --name lead_conversion_fields
python manage.py migrate
""",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
        ]
    },

    # ════════════════════════════════════════════════════════
    # 8️⃣  Frontend — تغيير الـ UI
    # ════════════════════════════════════════════════════════
    "8_frontend": {
        "title": "Frontend — تغيير الـ UI",
        "changes": [
            {
                "id": "8.1",
                "what": "الصفحة الرئيسية = Lead Pipeline (مش Customer List)",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "8.2",
                "what": "شاشة إنشاء Lead بدون Customer (بيانات الشخص على الـ Lead مباشرة)",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "8.3",
                "what": "زرار 'Mark as WON' → يحول لـ Customer أوتوماتيك",
                "priority": "🔴 Critical",
                "status": "[ ]"
            },
            {
                "id": "8.4",
                "what": "Customer List = فقط الـ Leads اللي lifecycle_stage = 'customer'",
                "priority": "🟡 Medium",
                "status": "[ ]"
            },
            {
                "id": "8.5",
                "what": "Timeline الـ Lead يعرض: مكالمات + تاسكس + فولو أبس + كوتيشنز",
                "priority": "🟡 Medium",
                "status": "[ ]"
            },
        ]
    },
}


# ════════════════════════════════════════════════════════════
# PRINT CHECKLIST
# ════════════════════════════════════════════════════════════
def print_plan(data: dict):
    total = done = 0
    for sec_key, sec in data.items():
        print(f"\n{'═'*58}")
        print(f"  {sec['title']}")
        print(f"{'═'*58}")
        items = sec.get("changes", [])
        for t in items:
            st   = t.get("status", "[ ]")
            icon = "✅" if st == "[x]" else ("🔄" if st == "[~]" else "⬜")
            pri  = t.get("priority", "")
            print(f"  {icon}  [{t['id']}] {pri}")
            print(f"       {t['what']}")
            total += 1
            if st == "[x]":
                done += 1

    pct = round((done / total) * 100) if total else 0
    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
    print(f"\n{'═'*58}")
    print(f"  📊 [{bar}] {pct}%  —  {done}/{total} مكتمل")
    print(f"{'═'*58}\n")


if __name__ == "__main__":
    print_plan(changes)

ملخص التغييرات بكلام بسيط 👇

إيه اللي هيتغير فعلاً؟ تغيير واحد بس في الـ database هو الأهم — الـ customer FK في الـ Lead model يبقى null=True مش إجباري. كل التاني هو منطق وـ UI.

إيه اللي مش محتاج يتغير؟ الـ Customer model يفضل زي ما هو — بس بيتنشئ أوتوماتيك لما Lead يعمل WON بس.

الـ Flow الجديد بالكامل:

📞 اتصال  →  🎯 Lead  →  pipeline  →  WON  →  👤 Customer (أوتوماتيك)
                ↓
            LOST → مغلق بسبب الرفض

عايز ابدأ التنفيذ من أي خطوة؟ 🎯

ممكن تكتبلي الخطه الكامله للتعديلات في هيئة sprint and check list عشان ننفذها ... تبقي md

# 🚀 HMDCM — Lead-First Architecture
## خطة التحويل الكاملة | Sprint Plan & Checklist

> **الهدف:** تحويل الـ Lead ليبقى الوحدة الرئيسية في السيستم
> والـ Customer مجرد Lead اتحول بعد WON
>
> **إجمالي المهام:** 47 task | **عدد السبرينتس:** 4
> **الأولويات:** 🔴 Critical | 🟡 Medium | 🟢 Nice to Have

---

## 📊 Progress Tracker

| Sprint | الموضوع | المهام | الحالة |
|--------|---------|--------|--------|
| Sprint 1 | Backend — Model & Migration | 8 tasks | ⬜ 0% |
| Sprint 2 | Backend — Services & APIs | 14 tasks | ⬜ 0% |
| Sprint 3 | Frontend — UI & Flow | 16 tasks | ⬜ 0% |
| Sprint 4 | Testing & Cleanup | 9 tasks | ⬜ 0% |

---

---

# 🏃 Sprint 1 — Backend: Model & Database
> **الهدف:** تعديل الـ Models وعمل الـ Migrations
> **المدة المقترحة:** 2-3 أيام

---

### 📁 leads/models.py

- [ ] 🔴 **[1.1]** تغيير `customer` FK في `Lead` من `CASCADE` إلى `SET_NULL, null=True, blank=True`
  ```python
  # ❌ قبل
  customer = models.ForeignKey(
      'customers.Customer',
      on_delete=models.CASCADE,
      related_name='leads'
  )

  # ✅ بعد
  customer = models.ForeignKey(
      'customers.Customer',
      on_delete=models.SET_NULL,
      null=True,
      blank=True,
      related_name='leads'
  )

    🔴 [1.2] إضافة converted_to_customer و converted_at fields

    converted_to_customer = models.BooleanField(
        default=False,
        db_index=True,
        help_text='تم تحويله لكاستمر بعد WON'
    )
    converted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='تاريخ التحويل لكاستمر'
    )

    🔴 [1.3] التأكد إن lifecycle_stage فيها customer و churned كـ choices

    # ✅ موجود بالفعل — بس تأكد إنها موجودة:
    LIFECYCLE_CHOICES = [
        ('lead',        'Lead'),
        ('prospect',    'Prospect'),
        ('opportunity', 'Opportunity'),
        ('customer',    'Customer'),   # ← لازم موجود
        ('churned',     'Churned'),    # ← لازم موجود
    ]

    🟡 [1.4] إضافة index على converted_to_customer للـ performance

    class Meta:
        indexes = [
            # ... الـ indexes الموجودة +
            models.Index(
                fields=['converted_to_customer', 'lifecycle_stage'],
                name='leads_converted_lifecycle_idx'
            ),
        ]

📁 Database Migration

    🔴 [1.5] عمل migration للتغييرات

    python manage.py makemigrations leads \
        --name lead_customer_optional_and_conversion_fields

    🔴 [1.6] مراجعة الـ migration file قبل التطبيق

    # افتح الملف وتأكد إن التغييرات صح
    cat crm_backend/apps/leads/migrations/00XX_lead_customer_optional_and_conversion_fields.py

    🔴 [1.7] تطبيق الـ migration

    python manage.py migrate

    🔴 [1.8] التأكد إن الـ data الموجودة لسه شغالة

    python manage.py shell
    # >>> from apps.leads.models import Lead
    # >>> Lead.objects.count()  # لازم يرجع نفس العدد
    # >>> Lead.objects.filter(customer__isnull=True).count()  # الجدد

✅ Sprint 1 — تعتبر خلصت لما:

    الـ migration اتطبق بدون errors
    Lead بيتنشئ من غير Customer
    الـ data القديمة لسه شغالة

🏃 Sprint 2 — Backend: Services, APIs & Logic

    الهدف: بناء الـ business logic الكاملة لـ Lead-First المدة المقترحة: 3-4 أيام

📁 leads/services.py

    🔴 [2.1] إضافة دالة convert_lead_to_customer()

    from django.utils.timezone import now

    def convert_lead_to_customer(lead_id: str, actor=None):
        """
        تحويل Lead لـ Customer بعد WON.
        - ينشئ Customer من بيانات الـ Lead
        - يربط Customer بالـ Lead
        - يحدث lifecycle_stage = 'customer'
        - يسجل LeadEvent
        """
        from apps.customers.services import create_customer

        lead = Lead.objects.get(pk=lead_id)

        # لو اتحول قبل كده — متعملش تاني
        if lead.converted_to_customer and lead.customer_id:
            return lead.customer

        # بناء بيانات الـ Customer من الـ Lead
        phones = []
        if lead.phone:
            phones = [{'number': lead.phone, 'phone_type': 'mobile', 'is_primary': True}]

        customer_data = {
            'first_name':  lead.first_name  or 'Unknown',
            'last_name':   lead.last_name   or '',
            'email':       lead.email       or '',
            'company':     lead.company     or '',
            'address':     lead.address     or '',
            'city':        lead.city        or '',
            'country':     lead.country     or 'Egypt',
            'source':      lead.source,
            'assigned_to': lead.assigned_to,
            'phones':      phones,
        }
        customer = create_customer(customer_data)

        # ربط وتحديث الـ Lead
        lead.customer              = customer
        lead.converted_to_customer = True
        lead.converted_at          = now()
        lead.lifecycle_stage       = 'customer'
        lead.save(update_fields=[
            'customer', 'converted_to_customer',
            'converted_at', 'lifecycle_stage'
        ])

        # تسجيل الحدث
        LeadEvent.objects.create(
            lead       = lead,
            event_type = 'stage_changed',
            actor      = actor,
            old_value  = 'opportunity',
            new_value  = 'customer',
            note       = f'Converted to Customer ID: {customer.id}'
        )

        return customer

    🔴 [2.2] إضافة دالة mark_won() تستدعي التحويل أوتوماتيك

    def mark_won(lead_id: str, won_amount=None, actor=None):
        """
        إغلاق Lead كـ WON وتحويله لـ Customer أوتوماتيك
        """
        lead = Lead.objects.get(pk=lead_id)

        # تحديث بيانات الـ WON
        lead.won_amount      = won_amount
        lead.won_at          = now()
        lead.lifecycle_stage = 'customer'
        lead.save(update_fields=['won_amount', 'won_at', 'lifecycle_stage'])

        # تسجيل حدث WON
        LeadEvent.objects.create(
            lead       = lead,
            event_type = 'won',
            actor      = actor,
            new_value  = str(won_amount or '0'),
        )

        # تحويل لـ Customer أوتوماتيك
        customer = convert_lead_to_customer(lead_id, actor=actor)

        return lead, customer

    🔴 [2.3] إضافة دالة mark_lost()

    def mark_lost(lead_id: str, lost_reason: str = '', actor=None):
        """
        إغلاق Lead كـ LOST مع تسجيل السبب
        """
        lead = Lead.objects.get(pk=lead_id)
        lead.lost_reason     = lost_reason
        lead.lost_at         = now()
        lead.lifecycle_stage = 'churned'
        lead.is_active       = False
        lead.save(update_fields=[
            'lost_reason', 'lost_at', 'lifecycle_stage', 'is_active'
        ])

        LeadEvent.objects.create(
            lead       = lead,
            event_type = 'lost',
            actor      = actor,
            new_value  = lost_reason,
        )

        return lead

    🔴 [2.4] تعديل create_lead() يشتغل بدون Customer

    def create_lead(data: dict, actor=None) -> Lead:
        """
        إنشاء Lead جديد — Customer مش مطلوب
        البيانات الشخصية (الاسم، التليفون) على الـ Lead مباشرة
        """
        # مش بنشترط customer_id
        lead = Lead.objects.create(**data)

        LeadEvent.objects.create(
            lead       = lead,
            event_type = 'created',
            actor      = actor,
            new_value  = lead.title,
        )

        return lead

📁 leads/views.py

    🔴 [2.5] إضافة action mark-won

    @action(detail=True, methods=['post'], url_path='mark-won')
    def mark_won(self, request, pk=None):
        """POST /api/leads/{id}/mark-won/"""
        won_amount = request.data.get('won_amount')
        lead, customer = services.mark_won(
            pk,
            won_amount = won_amount,
            actor      = request.user
        )
        return Response({
            'detail':      'Lead marked as WON ✅',
            'lead_id':     str(lead.id),
            'customer_id': str(customer.id),
        })

    🔴 [2.6] إضافة action mark-lost

    @action(detail=True, methods=['post'], url_path='mark-lost')
    def mark_lost(self, request, pk=None):
        """POST /api/leads/{id}/mark-lost/"""
        lost_reason = request.data.get('lost_reason', '')
        if not lost_reason:
            return Response(
                {'error': 'lost_reason مطلوب'},
                status=400
            )
        lead = services.mark_lost(
            pk,
            lost_reason = lost_reason,
            actor       = request.user
        )
        return Response({'detail': 'Lead marked as LOST ❌'})

    🟡 [2.7] إضافة action timeline على الـ Lead

    @action(detail=True, methods=['get'], url_path='timeline')
    def timeline(self, request, pk=None):
        """
        GET /api/leads/{id}/timeline/
        كل حاجة اتعملت على الـ Lead:
        calls + notes + followups + tasks + quotations + events
        """
        from apps.calls.models    import Call
        from apps.notes.models    import Note
        from apps.followups.models import Followup
        from apps.tasks.models    import Task
        from apps.sales.models    import Quotation

        timeline = []

        # Calls
        for call in Call.objects.filter(lead_id=pk).order_by('-started_at')[:30]:
            timeline.append({
                'type':      'call',
                'date':      call.started_at,
                'direction': call.direction,
                'status':    call.status,
                'duration':  call.duration,
            })

        # Notes
        for note in Note.objects.filter(lead_id=pk).order_by('-created_at')[:30]:
            timeline.append({
                'type':    'note',
                'date':    note.created_at,
                'content': note.content,
                'author':  note.author.get_full_name(),
            })

        # Followups
        for fu in Followup.objects.filter(lead_id=pk).order_by('-scheduled_at')[:20]:
            timeline.append({
                'type':         'followup',
                'date':         fu.scheduled_at,
                'title':        fu.title,
                'status':       fu.status,
                'followup_type': fu.followup_type,
            })

        # Tasks
        for task in Task.objects.filter(lead_id=pk).order_by('-created_at')[:20]:
            timeline.append({
                'type':        'task',
                'date':        task.created_at,
                'title':       task.title,
                'status':      task.status,
                'priority':    task.priority,
                'action_type': task.action_type,
            })

        # Quotations
        for q in Quotation.objects.filter(lead_id=pk).order_by('-created_at')[:10]:
            timeline.append({
                'type':       'quotation',
                'date':       q.created_at,
                'ref_number': q.ref_number,
                'status':     q.status,
                'total':      str(q.total_amount),
            })

        # Sort by date
        timeline.sort(key=lambda x: x['date'] or '', reverse=True)

        return Response({'count': len(timeline), 'results': timeline})

📁 calls/services.py أو asterisk/

    🔴 [2.8] Screen Pop يبحث عن Lead بالتليفون مش Customer

    def find_lead_by_phone(phone_number: str):
        """
        Screen Pop — بيدور على Lead مش Customer
        لما اتصال يجي، السيستم يعرض الـ Lead مباشرة
        """
        from apps.leads.models import Lead
        from apps.common.utils import normalize_phone

        normalized = normalize_phone(phone_number)

        lead = Lead.objects.filter(
            phone__in=[phone_number, normalized],
            lifecycle_stage__in=['lead', 'prospect', 'opportunity']
        ).order_by('-created_at').first()

        return lead

    🔴 [2.9] لما اتصال يجي ومفيش Lead — ينشئ Lead جديد أوتوماتيك

    def get_or_create_lead_for_call(phone_number: str, actor=None):
        """
        لما اتصال وارد يجي:
        1. يبحث عن Lead موجود برقم التليفون
        2. لو مش موجود — ينشئ Lead جديد
        """
        from apps.leads.services import create_lead

        lead = find_lead_by_phone(phone_number)

        if not lead:
            lead = create_lead({
                'title':          f'Inbound Call — {phone_number}',
                'phone':          phone_number,
                'source':         'call',
                'lifecycle_stage': 'lead',
            }, actor=actor)

        return lead

📁 leads/serializers.py

    🟡 [2.10] تحديث LeadDetailSerializer يشمل الـ fields الجديدة

    # إضافة للـ fields:
    'converted_to_customer',
    'converted_at',
    'customer_id',   # read-only — يظهر بعد التحويل

    🟡 [2.11] إنشاء LeadCreateSerializer بدون Customer field

    class LeadCreateSerializer(serializers.ModelSerializer):
        """
        Serializer لإنشاء Lead جديد بدون Customer
        البيانات الشخصية على الـ Lead مباشرة
        """
        class Meta:
            model  = Lead
            fields = [
                'title', 'first_name', 'last_name',
                'email', 'phone', 'company',
                'source', 'assigned_to', 'campaign',
                'value', 'description',
                'stage', 'status', 'priority',
            ]

📁 customers/views.py

    🟡 [2.12] CustomerHistoryView يعرض بيانات الـ Lead الأصلي

    # إضافة للـ timeline:
    # عرض الـ Lead الأصلي اللي اتحول منه الكاستمر
    lead_origin = Lead.objects.filter(
        customer_id=pk,
        converted_to_customer=True
    ).first()

    🟡 [2.13] endpoint جديد: GET /api/customers/{id}/lead/

    @action(detail=True, methods=['get'], url_path='lead')
    def original_lead(self, request, pk=None):
        """إرجاع الـ Lead الأصلي اللي اتحول منه الكاستمر"""
        lead = Lead.objects.filter(
            customer_id=pk,
            converted_to_customer=True
        ).first()
        if not lead:
            return Response({'detail': 'No original lead found'}, status=404)
        return Response(LeadDetailSerializer(lead).data)

    🟢 [2.14] CustomerListView يعرض بس الـ Leads اللي lifecycle_stage=customer

    # في customers/selectors.py
    def get_all_customers(user=None):
        """
        الكاستمرز = الـ Leads اللي اشتروا فقط
        """
        return Customer.objects.filter(
            leads__converted_to_customer=True,
            is_active=True
        ).prefetch_related('phones', 'tags').distinct()

✅ Sprint 2 — تعتبر خلصت لما:

    POST /api/leads/{id}/mark-won/ بيشتغل وبينشئ Customer أوتوماتيك
    POST /api/leads/{id}/mark-lost/ بيشتغل ويغلق الـ Lead
    Lead بيتنشئ من غير Customer من أول وهيئة
    Screen Pop بيدور على Lead مش Customer
    GET /api/leads/{id}/timeline/ بيرجع الـ timeline كامل

🏃 Sprint 3 — Frontend: UI & Flow

    الهدف: تغيير الـ UI عشان الـ Lead يبقى المحور الأساسي المدة المقترحة: 4-5 أيام

📁 الصفحة الرئيسية — Dashboard

    🔴 [3.1] الـ Dashboard الرئيسي يبدأ بـ Lead Pipeline مش Customer List

    /dashboard  →  Lead Kanban Board

    🔴 [3.2] إضافة Stats على الـ Dashboard

    - إجمالي الـ Leads النشطة
    - Leads بـ WON النهارده
    - Leads بـ LOST النهارده  
    - Leads محتاجة followup

📁 صفحة Lead

    🔴 [3.3] فورم إنشاء Lead جديد بدون Customer field

    Fields:
    - الاسم الأول + الأخير
    - رقم التليفون (أساسي)
    - الإيميل (اختياري)
    - الشركة (اختياري)
    - المصدر (اتصال / يدوي / كامبين)
    - الأجنت المسؤول
    - القيمة المتوقعة (اختياري)

    🔴 [3.4] Kanban Board لمراحل الـ Pipeline

    جديد | تم التواصل | مهتم | عرض سعر | تفاوض | جاهز للإغلاق

    🔴 [3.5] صفحة تفاصيل الـ Lead تعرض:

    - بيانات الشخص (الاسم، التليفون، الإيميل)
    - مرحلة الـ Pipeline
    - الـ Score والـ Classification
    - الـ Timeline (مكالمات + نوتس + تاسكس + فولو أبس + كوتيشنز)

    🔴 [3.6] زرار "Mark as WON" مع فورم صغير

    - إدخال المبلغ النهائي (won_amount)
    - تأكيد التحويل
    - بعد الضغط → ينشئ Customer أوتوماتيك
    - يعرض رسالة: "تم تحويل الـ Lead لكاستمر ✅"

    🔴 [3.7] زرار "Mark as LOST" مع فورم صغير

    - إدخال سبب الرفض (إجباري)
    - تأكيد الإغلاق

    🟡 [3.8] عرض الـ Lead Score بشكل visual

    - Progress bar للـ Score
    - Badge للـ Classification (cold/warm/hot/very_hot)
    - تاريخ آخر تحديث للـ Score

    🟡 [3.9] Drag & Drop بين مراحل الـ Pipeline

    PATCH /api/leads/{id}/move-stage/
    body: { stage_id: "..." }

📁 صفحة Customer

    🔴 [3.10] Customer List يعرض بس الـ Leads اللي اشتروا

    Badge: "Customer منذ {converted_at}"
    Link: "عرض الـ Lead الأصلي →"

    🔴 [3.11] صفحة تفاصيل Customer تعرض:

    - بطاقة: "تحول من Lead بتاريخ {converted_at}"
    - زرار: "عرض الـ Lead الأصلي"
    - الـ Timeline الكاملة (مكالمات + تيكتس + موافقات + نوتس)

    🟡 [3.12] إزالة أو إخفاء فورم "إنشاء Customer يدوي"

    الكاستمر بيتنشئ بس من WON — مش يدوي

📁 صفحة المكالمات — Screen Pop

    🔴 [3.13] Screen Pop يعرض الـ Lead مش الـ Customer

    لما اتصال يجي:
    ✅ لو فيه Lead → يفتح صفحة الـ Lead
    ⚠️ لو مفيش → يفتح فورم Lead جديد بالرقم محشي أوتوماتيك

    🟡 [3.14] بعد خلاص المكالمة — زرار سريع

    [ + إنشاء Followup ] [ + إنشاء Task ] [ تحديث المرحلة ]

📁 Navigation

    🟡 [3.15] تحديث الـ Sidebar

    🎯 Leads (Pipeline)     ← أول حاجة
    👤 Customers            ← تاني (بس المحولين)
    📞 Calls
    📅 Follow-ups
    ✅ Tasks
    💰 Quotations
    🎫 Tickets
    📊 Reports

    🟢 [3.16] إضافة فلتر على Lead List

    - lifecycle_stage: lead / prospect / opportunity / customer / churned
    - classification: cold / warm / hot / very_hot
    - assigned_to
    - source
    - date range

✅ Sprint 3 — تعتبر خلصت لما:

    إنشاء Lead من غير Customer شغال من الـ UI
    Mark as WON بينشئ Customer وبيعرض رسالة تأكيد
    Customer List بيعرض بس المحولين
    Screen Pop بيفتح Lead مش Customer

🏃 Sprint 4 — Testing & Cleanup

    الهدف: اختبار كل حاجة والتأكد إن مفيش bugs المدة المقترحة: 2-3 أيام

🧪 Backend Tests

    🔴 [4.1] اختبار convert_lead_to_customer()

    # Test cases:
    # 1. Lead بدون customer → ينشئ Customer جديد ✅
    # 2. Lead اتحول قبل كده → ميعملش تاني ✅
    # 3. Lead من غير phone → Customer بدون phone ✅
    # 4. LeadEvent اتسجل ✅

    🔴 [4.2] اختبار mark_won()

    # Test cases:
    # 1. won_amount يتسجل ✅
    # 2. won_at يتسجل ✅
    # 3. lifecycle_stage = 'customer' ✅
    # 4. Customer اتنشئ أوتوماتيك ✅

    🔴 [4.3] اختبار mark_lost()

    # Test cases:
    # 1. lost_reason مطلوب ✅
    # 2. is_active = False ✅
    # 3. lifecycle_stage = 'churned' ✅

    🔴 [4.4] اختبار find_lead_by_phone()

    # Test cases:
    # 1. رقم موجود → يرجع Lead ✅
    # 2. رقم مش موجود → يرجع None ✅
    # 3. Lead اتحول لـ Customer → ميرجعوش ✅

🧪 API Tests

    🔴 [4.5] اختبار POST /api/leads/ بدون customer_id

    curl -X POST /api/leads/ \
      -H "Authorization: Bearer TOKEN" \
      -d '{
        "title": "Lead تجريبي",
        "first_name": "أحمد",
        "phone": "01012345678",
        "source": "call"
      }'
    # Expected: 201 Created ✅

    🔴 [4.6] اختبار POST /api/leads/{id}/mark-won/

    curl -X POST /api/leads/{id}/mark-won/ \
      -d '{"won_amount": 5000}'
    # Expected: customer_id في الـ response ✅

    🟡 [4.7] اختبار GET /api/leads/{id}/timeline/

    curl /api/leads/{id}/timeline/
    # Expected: list مرتبة بالتاريخ ✅

🧹 Cleanup

    🟡 [4.8] حذف أو تعليق أي كود بيجبر Customer قبل Lead

    # ابحث عن:
    # - Customer.objects.create() في lead flow
    # - required customer validators
    # - customer FK validators

    🟢 [4.9] تحديث الـ Swagger Docs

    /api/docs/ → التأكد إن الـ endpoints الجديدة ظاهرة
    mark-won / mark-lost / timeline

✅ Sprint 4 — تعتبر خلصت لما:

    كل الـ tests بيعدي ✅
    مفيش console errors في الـ Frontend
    الـ Swagger Docs محدثة
    الـ data القديمة لسه شغالة

🗺️ ملخص الـ Flow بعد التنفيذ

📞 اتصال وارد
      ↓
🔍 Screen Pop — بيدور على Lead بالتليفون
      ↓
   ┌──────────────────────────────┐
   │  Lead موجود?                 │
   │  ✅ نعم → يفتح صفحة الـ Lead │
   │  ❌ لا  → ينشئ Lead جديد     │
   └──────────────────────────────┘
      ↓
🎯 Lead Pipeline
   جديد → تم التواصل → مهتم → عرض سعر → تفاوض → جاهز للإغلاق
      ↓
   ┌─────────────────────────────────────┐
   │  القرار النهائي                      │
   │  ✅ WON → ينشئ Customer أوتوماتيك  │
   │  ❌ LOST → يُغلق مع سبب الرفض      │
   └─────────────────────────────────────┘
      ↓ (WON فقط)
👤 Customer
   تيكتس + موافقات + فولو أبس مستمرة

📋 إجمالي المهام
الأولوية 	العدد
🔴 Critical 	28 task
🟡 Medium 	14 task
🟢 Nice to Have 	5 tasks
الإجمالي 	47 task
