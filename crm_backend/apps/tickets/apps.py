from django.apps import AppConfig


class TicketsConfig(AppConfig):
    name            = "apps.tickets"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        import apps.tickets.signals  # noqa — registers all signal handlers
