from .models import Lead
from apps.customers.selectors import get_customer_by_id


def create_lead(customer_id, title, status_id=None, priority_id=None,
                source='manual', assigned_to=None, **kwargs) -> Lead:
    customer = get_customer_by_id(customer_id)
    return Lead.objects.create(
        customer=customer, title=title,
        status_id=status_id, priority_id=priority_id,
        source=source, assigned_to=assigned_to, **kwargs
    )


def assign_lead(lead_id, agent_id):
    Lead.objects.filter(pk=lead_id).update(assigned_to_id=agent_id)


def update_lead_status(lead_id, status_id):
    from django.utils import timezone
    from apps.leads.models import LeadStatus
    lead = Lead.objects.get(pk=lead_id)
    lead.status_id = status_id
    status = LeadStatus.objects.get(pk=status_id)
    if status.is_closed:
        lead.closed_at = timezone.now()
    lead.save(update_fields=['status_id', 'closed_at'])
    return lead
