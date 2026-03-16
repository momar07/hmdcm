from .models import SystemSetting


def get_setting(key: str, default=None):
    try:
        return SystemSetting.objects.get(key=key).value
    except SystemSetting.DoesNotExist:
        return default


def get_public_settings():
    return SystemSetting.objects.filter(is_public=True)


def get_all_settings():
    return SystemSetting.objects.all()
