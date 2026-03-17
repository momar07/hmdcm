import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('crm')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


# ── Periodic tasks (Celery Beat) ──────────────────────────────
app.conf.beat_schedule = {
    # followup reminders every 15 minutes
    'followup-reminders-every-15min': {
        'task':     'apps.followups.tasks.send_followup_reminders',
        'schedule': crontab(minute='*/15'),
    },
    # auto-cancel overdue followups every day at 01:00
    'auto-cancel-overdue-followups-daily': {
        'task':     'apps.followups.tasks.auto_cancel_overdue_followups',
        'schedule': crontab(hour=1, minute=0),
    },
}

app.conf.timezone = 'Africa/Cairo'
