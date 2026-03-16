from config.celery import app
import logging
logger = logging.getLogger(__name__)


@app.task(name='apps.followups.tasks.send_followup_reminders')
def send_followup_reminders():
    """Send in-app reminder for due follow-ups."""
    from .selectors import get_due_followups
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync

    channel_layer = get_channel_layer()
    followups = get_due_followups()

    for fu in followups:
        group_name = f'agent_{fu.assigned_to_id}'
        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                'type': 'followup.reminder',
                'followup_id': str(fu.id),
                'title': fu.title,
                'customer': fu.customer.get_full_name(),
                'scheduled_at': fu.scheduled_at.isoformat(),
            }
        )
        fu.reminder_sent = True
        fu.save(update_fields=['reminder_sent'])

    logger.info(f'Sent {followups.count()} followup reminders.')
