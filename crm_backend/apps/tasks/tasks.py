import logging
from celery import shared_task
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_task_reminders(self):
    """
    Run every minute via Celery Beat.
    Finds tasks with reminder_at <= now and reminder_sent=False,
    sends a WebSocket notification to the assigned agent.
    """
    from .models import Task
    now = timezone.now()

    due_tasks = Task.objects.filter(
        reminder_at__lte=now,
        reminder_sent=False,
        status__in=['pending', 'in_progress'],
    ).select_related('assigned_to', 'assigned_by')

    channel_layer = get_channel_layer()
    count = 0

    for task in due_tasks:
        try:
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f'agent_{task.assigned_to_id}',
                    {
                        'type':        'task_assigned',
                        'task_id':     str(task.id),
                        'title':       f'⏰ Reminder: {task.title}',
                        'priority':    task.priority,
                        'due_date':    task.due_date.isoformat() if task.due_date else None,
                        'assigned_by': 'System Reminder',
                    }
                )
            # Persist as in-app notification (Phase 1A)
            try:
                from apps.notifications.services import create_notification
                create_notification(
                    recipient=task.assigned_to,
                    type='task_reminder',
                    title=f'⏰ Reminder: {task.title}',
                    body=f'Priority: {task.priority}',
                    data={'task_id': str(task.id), 'priority': task.priority},
                    link=f'/tasks/{task.id}',
                    priority='high' if task.priority in ['high', 'urgent'] else 'normal',
                    push_realtime=False,  # WS already sent above
                )
            except Exception as _ne:
                logger.warning(f'[TaskReminder] notif persist failed: {_ne}')
            task.reminder_sent = True
            task.save(update_fields=['reminder_sent'])
            count += 1
            logger.info(f'[TaskReminder] Sent reminder for task {task.id} to {task.assigned_to.email}')
        except Exception as e:
            logger.error(f'[TaskReminder] Failed for task {task.id}: {e}')

    return f'Sent {count} task reminders'
