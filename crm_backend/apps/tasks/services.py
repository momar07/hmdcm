import logging
from django.utils import timezone
from .models import Task, TaskLog, TaskStatus

logger = logging.getLogger(__name__)


def create_task(title, assigned_to, assigned_by=None, **kwargs):
    """Create a task and log the creation."""
    task = Task.objects.create(
        title       = title,
        assigned_to = assigned_to,
        assigned_by = assigned_by,
        **kwargs
    )
    TaskLog.objects.create(
        task   = task,
        actor  = assigned_by,
        action = 'created',
        detail = f'Task created and assigned to {assigned_to.get_full_name()}',
    )
    # Send WebSocket notification to assigned agent
    _notify_agent(task)
    return task


def update_task_status(task, new_status, actor, comment=''):
    """Update task status and log the change."""
    old_status = task.status
    task.status = new_status
    if new_status == TaskStatus.COMPLETED:
        task.completed_at = timezone.now()
        if comment:
            task.comment = comment
    task.save()

    TaskLog.objects.create(
        task   = task,
        actor  = actor,
        action = 'status_changed',
        detail = f'{old_status} → {new_status}' + (f' | {comment}' if comment else ''),
    )
    return task


def _notify_agent(task):
    """Send real-time WebSocket notification to assigned agent."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        async_to_sync(channel_layer.group_send)(
            f'user_{task.assigned_to_id}',
            {
                'type':     'task_assigned',
                'task_id':  str(task.id),
                'title':    task.title,
                'priority': task.priority,
                'due_date': task.due_date.isoformat() if task.due_date else None,
                'assigned_by': task.assigned_by.get_full_name() if task.assigned_by else 'System',
            }
        )
    except Exception as e:
        logger.warning(f'Task WS notification failed: {e}')
