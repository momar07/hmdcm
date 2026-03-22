"""
Seed default SLA policies.
Run with: python manage.py shell < apps/tickets/seed_sla.py
Or call seed_default_sla_policies() from anywhere.
"""
from apps.tickets.models import SLAPolicy


def seed_default_sla_policies():
    policies = [
        {
            "name":               "Low Priority SLA",
            "priority":           "low",
            "first_response_hrs": 24,
            "resolution_hrs":     120,   # 5 days
            "business_hours_only": True,
        },
        {
            "name":               "Medium Priority SLA",
            "priority":           "medium",
            "first_response_hrs": 8,
            "resolution_hrs":     48,    # 2 days
            "business_hours_only": True,
        },
        {
            "name":               "High Priority SLA",
            "priority":           "high",
            "first_response_hrs": 4,
            "resolution_hrs":     24,    # 1 day
            "business_hours_only": False,
        },
        {
            "name":               "Urgent Priority SLA",
            "priority":           "urgent",
            "first_response_hrs": 1,
            "resolution_hrs":     8,     # 8 hours
            "business_hours_only": False,
        },
    ]

    created = 0
    for p in policies:
        _, was_created = SLAPolicy.objects.get_or_create(
            priority=p["priority"],
            defaults=p,
        )
        if was_created:
            created += 1
            print(f"  ✅ Created: {p['name']}")
        else:
            print(f"  ℹ️  Already exists: {p['name']}")

    print(f"\nDone — {created} new policies created")
    return created


seed_default_sla_policies()
