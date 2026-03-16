"""
seed_calls.py — يضيف بيانات تجريبية للـ calls
شغّله من جوه crm_backend:
    python seed_calls.py
"""
import os, django, random
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.utils import timezone
from apps.users.models     import User
from apps.customers.models import Customer, CustomerPhone
from apps.calls.models     import Call, Disposition, CallDisposition

# ─── helpers ────────────────────────────────────────────────────────────────
def rnd_phone():
    return f"010{random.randint(10000000, 99999999)}"

def rnd_duration():
    return random.randint(30, 600)

STATUSES   = ['answered', 'no_answer', 'busy', 'failed',
              'answered', 'answered', 'answered']
DIRECTIONS = ['inbound', 'outbound', 'inbound', 'outbound', 'inbound']

AGENT_PHONES = ['101', '102', '103', '104', '105']

# ─── جيب أول يوزر ────────────────────────────────────────────────────────
agent = User.objects.filter(role__in=['admin', 'agent', 'supervisor']).first()
if not agent:
    print("❌ مفيش يوزر — اعمل createsuperuser الأول")
    exit(1)

# جيب extension number بأمان
try:
    agent_ext = agent.extension.number
except Exception:
    agent_ext = random.choice(AGENT_PHONES)

print(f"👤 Agent: {agent.get_full_name()} | Extension: {agent_ext}")

# ─── جيب أو اعمل customers ───────────────────────────────────────────────
customers = list(Customer.objects.filter(is_active=True)[:10])

if not customers:
    print("⚠️  مفيش customers — هنعملهم دلوقتي...")
    names = [
        ("Ahmed",   "Hassan"),
        ("Mohamed", "Ali"),
        ("Sara",    "Ibrahim"),
        ("Fatma",   "Mostafa"),
        ("Omar",    "Khaled"),
    ]
    for first, last in names:
        c = Customer.objects.create(
            first_name=first,
            last_name=last,
            email=f"{first.lower()}.{last.lower()}@test.com",
            is_active=True,
        )
        CustomerPhone.objects.create(
            customer=c,
            number=rnd_phone(),
            phone_type='mobile',
            is_primary=True,
        )
        customers.append(c)
    print(f"✅ تم إنشاء {len(customers)} customers")

# ─── إنشاء Dispositions ──────────────────────────────────────────────────
disp_data = [
    {"name": "Interested",         "color": "#22c55e", "requires_followup": True},
    {"name": "Not Interested",     "color": "#ef4444", "requires_followup": False},
    {"name": "Callback Requested", "color": "#f59e0b", "requires_followup": True},
    {"name": "Wrong Number",       "color": "#6b7280", "requires_followup": False},
    {"name": "No Answer",          "color": "#3b82f6", "requires_followup": True},
]
dispositions = []
for d in disp_data:
    obj, created = Disposition.objects.get_or_create(
        name=d['name'],
        defaults={
            'color':             d['color'],
            'requires_followup': d['requires_followup'],
            'is_active':         True,
        }
    )
    dispositions.append(obj)
    if created:
        print(f"  ✅ Disposition: {obj.name}")
    else:
        print(f"  ⏭️  Disposition موجود: {obj.name}")

# ─── إنشاء Calls ─────────────────────────────────────────────────────────
print(f"\n📞 جاري إنشاء 30 call...")
created_count = 0

for i in range(30):
    status    = random.choice(STATUSES)
    direction = random.choice(DIRECTIONS)
    customer  = random.choice(customers)

    # جيب phone بأمان
    phone_obj = customer.phones.filter(is_active=True).first()
    cust_phone = phone_obj.number if phone_obj else rnd_phone()

    # حدد caller و callee حسب الاتجاه
    if direction == 'inbound':
        caller = cust_phone
        callee = agent_ext
    else:
        caller = agent_ext
        callee = cust_phone

    started_at = timezone.now() - timedelta(
        days=random.randint(0, 14),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )

    duration    = rnd_duration() if status == 'answered' else random.randint(0, 15)
    answered_at = started_at + timedelta(seconds=random.randint(5, 20)) \
                  if status == 'answered' else None
    ended_at    = started_at + timedelta(seconds=duration + 10) \
                  if status != 'ringing' else None

    call = Call.objects.create(
        uniqueid      = f"seed-{i+1:04d}-{random.randint(1000, 9999)}",
        caller_number = caller,
        callee_number = callee,
        direction     = direction,
        status        = status,
        agent         = agent,
        customer      = customer,
        duration      = duration,
        started_at    = started_at,
        answered_at   = answered_at,
        ended_at      = ended_at,
    )

    # أضف disposition للـ answered calls (70% منهم)
    if status == 'answered' and dispositions and random.random() > 0.3:
        disp = random.choice(dispositions)
        CallDisposition.objects.get_or_create(
            call=call,
            defaults={
                'disposition': disp,
                'agent':       agent,
                'notes':       f"Test note #{i+1}",
            }
        )

    created_count += 1
    print(f"  [{i+1:02d}] {direction:8s} | {status:10s} | "
          f"{caller} → {callee} | {customer.first_name}")

print(f"\n{'='*55}")
print(f"✅  تم إنشاء {created_count} calls بنجاح!")
print(f"   Customers : {len(customers)}")
print(f"   Dispositions: {len(dispositions)}")
print(f"   Agent     : {agent.get_full_name()} ({agent.role})")
print(f"{'='*55}")
print("\n👉 افتح: http://localhost:3000/calls")
