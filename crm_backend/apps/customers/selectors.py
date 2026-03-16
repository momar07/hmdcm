from django.db.models import Q, QuerySet, Prefetch
from .models import Customer, CustomerPhone


def get_all_customers(user=None) -> QuerySet:
    qs = Customer.objects.prefetch_related('phones', 'tags').filter(is_active=True)
    if user and user.role == 'agent':
        qs = qs.filter(assigned_to=user)
    return qs


def get_customer_by_id(customer_id) -> Customer:
    return Customer.objects.prefetch_related('phones', 'tags').get(pk=customer_id)


def search_customers(query: str) -> QuerySet:
    return Customer.objects.prefetch_related('phones', 'tags').filter(
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query) |
        Q(email__icontains=query) |
        Q(company__icontains=query) |
        Q(phones__number__icontains=query)
    ).filter(is_active=True).distinct()


def find_customer_by_phone(phone_number: str) -> Customer | None:
    """Used for screen pop — match incoming caller number."""
    from apps.common.utils import normalize_phone
    normalized = normalize_phone(phone_number)
    phone = CustomerPhone.objects.select_related('customer').filter(
        Q(normalized=normalized) | Q(number=phone_number),
        is_active=True
    ).first()
    return phone.customer if phone else None
