from django.apps import AppConfig

class CallsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.calls'
    label = 'calls'

    def ready(self):
        from . import signals  # noqa: F401
