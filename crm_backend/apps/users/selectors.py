from django.db.models import QuerySet
from .models import User, Extension, Queue


def get_all_users() -> QuerySet:
    return User.objects.select_related('extension', 'team').filter(is_active=True)


def get_user_by_id(user_id) -> User:
    return User.objects.select_related('extension', 'team').get(pk=user_id)


def get_users_by_role(role: str) -> QuerySet:
    return get_all_users().filter(role=role)


def get_agents_in_team(team_id) -> QuerySet:
    return get_all_users().filter(team_id=team_id, role='agent')


def get_extension_by_number(number: str) -> Extension:
    return Extension.objects.select_related('user').get(number=number)


def get_active_queues() -> QuerySet:
    return Queue.objects.filter(is_active=True)
