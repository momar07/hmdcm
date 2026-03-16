import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('crm_backend')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Periodic tasks
app.conf.beat_schedule = {
    'sync-cdr-every-60s': {
        'task': 'apps.integrations.tasks.sync_cdr_task',
        'schedule': 60.0,
    },
    'check-followup-reminders-every-5m': {
        'task': 'apps.followups.tasks.send_followup_reminders',
        'schedule': 300.0,
    },
}
