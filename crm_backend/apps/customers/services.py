from .models import Customer, CustomerPhone
from .selectors import get_customer_by_id


def create_customer(data: dict) -> Customer:
    phones_data = data.pop('phones', [])
    tags = data.pop('tags', [])
    customer = Customer.objects.create(**data)
    if tags:
        customer.tags.set(tags)
    for phone in phones_data:
        CustomerPhone.objects.create(customer=customer, **phone)
    return customer


def add_phone_to_customer(customer_id, number: str, phone_type='mobile', is_primary=False):
    customer = get_customer_by_id(customer_id)
    if is_primary:
        customer.phones.filter(is_primary=True).update(is_primary=False)
    return CustomerPhone.objects.create(
        customer=customer, number=number,
        phone_type=phone_type, is_primary=is_primary
    )


def merge_customers(source_id, target_id):
    """Merge source into target — moves phones, leads, calls to target."""
    source = get_customer_by_id(source_id)
    target = get_customer_by_id(target_id)
    source.phones.update(customer=target)
    source.is_active = False
    source.save(update_fields=['is_active'])
    return target
