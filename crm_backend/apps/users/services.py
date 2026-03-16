from .models import User, Extension
from .selectors import get_user_by_id


def create_user(email, first_name, last_name, role, password, team=None, phone=''):
    user = User.objects.create_user(
        email=email, password=password,
        first_name=first_name, last_name=last_name,
        role=role, team=team, phone=phone,
    )
    return user


def update_user_status(user_id, status: str):
    User.objects.filter(pk=user_id).update(status=status)


def assign_extension(user_id, number: str, peer_name: str = '', secret: str = ''):
    user = get_user_by_id(user_id)
    ext, created = Extension.objects.update_or_create(
        user=user,
        defaults={'number': number, 'peer_name': peer_name, 'secret': secret}
    )
    return ext
