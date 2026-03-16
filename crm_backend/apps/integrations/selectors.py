from .models import IntegrationSetting


def get_setting(key: str) -> str:
    try:
        return IntegrationSetting.objects.get(key=key).value
    except IntegrationSetting.DoesNotExist:
        return ''


def get_all_settings():
    return IntegrationSetting.objects.all()
