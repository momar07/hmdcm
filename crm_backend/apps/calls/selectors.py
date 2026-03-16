from django.db.models import QuerySet
from .models import Call


def get_all_calls(user=None) -> QuerySet:
    qs = Call.objects.select_related('agent', 'customer', 'extension', 'queue').all()
    if user and user.role == 'agent':
        qs = qs.filter(agent=user)
    elif user and user.role == 'supervisor':
        qs = qs.filter(agent__team=user.team)
    return qs


def get_call_by_uniqueid(uniqueid: str) -> Call:
    return Call.objects.get(uniqueid=uniqueid)


def get_active_calls() -> QuerySet:
    return Call.objects.filter(status='ringing').select_related('agent', 'customer')
