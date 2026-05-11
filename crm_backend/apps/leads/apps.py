from django.apps import AppConfig


class LeadsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name               = 'apps.leads'
    label              = 'leads'

    def ready(self):
        # Register cross-app signal handlers (Quotation/Approval/Task → LeadEvent)
        from . import signals
        signals.connect_all()
