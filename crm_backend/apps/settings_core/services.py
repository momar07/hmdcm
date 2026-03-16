from .models import SystemSetting


def upsert_setting(key: str, value: str, category='general',
                   description='', is_public=False) -> SystemSetting:
    setting, _ = SystemSetting.objects.update_or_create(
        key=key,
        defaults={
            'value':       value,
            'category':    category,
            'description': description,
            'is_public':   is_public,
        }
    )
    return setting
