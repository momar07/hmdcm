import logging
from celery import shared_task
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_followup_reminders(self):
    """
    Runs every 15 minutes via Celery Beat.
    Finds pending followups due in the next 30 minutes
    and pushes a WebSocket reminder to the assigned agent.
    """
    from .models import Followup

    now     = timezone.now()
    window  = now + timezone.timedelta(minutes=30)

    due = Followup.objects.filter(
        status       = 'pending',
        reminder_sent= False,
        scheduled_at__gte = now,
        scheduled_at__lte = window,
    ).select_related('assigned_to', 'lead')

    channel_layer = get_channel_layer()
    count = 0

    for f in due:
        if not f.assigned_to:
            continue
        try:
            async_to_sync(channel_layer.group_send)(
                f'agent_{f.assigned_to_id}',
                {
                    'type':         'followup_reminder',
                    'followup_id':  str(f.id),
                    'title':        f.title,
                    'customer':     f.lead.title if f.lead else '—',
                    'scheduled_at': f.scheduled_at.isoformat(),
                }
            )
            f.reminder_sent = True
            f.save(update_fields=['reminder_sent'])
            count += 1
            logger.info(f'[Reminder] Sent for followup {f.id} → agent {f.assigned_to_id}')
        except Exception as exc:
            logger.error(f'[Reminder] Failed for {f.id}: {exc}')

    logger.info(f'[Reminder] Done — {count} reminders sent')
    return f'{count} reminders sent'


@shared_task(bind=True, max_retries=3)
def auto_cancel_overdue_followups(self):
    """
    Runs every day at midnight.
    Cancels pending followups that are more than 7 days overdue.
    """
    from .models import Followup

    cutoff = timezone.now() - timezone.timedelta(days=7)
    overdue = Followup.objects.filter(
        status       = 'pending',
        scheduled_at__lt = cutoff,
    )
    count = overdue.update(status='cancelled')
    logger.info(f'[AutoCancel] Cancelled {count} overdue followups')
    return f'{count} followups cancelled'
