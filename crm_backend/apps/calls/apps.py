from django.apps import AppConfig

class CallsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.calls'
    label = 'calls'

    def ready(self):
        # Wire call-link signals (Phase 5B)
        try:
            from .signals import connect_call_link_signals
            connect_call_link_signals()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'[calls.apps] failed to wire signals: {e}')
        # ── existing ready() body below ──
        from . import signals  # noqa: F401
