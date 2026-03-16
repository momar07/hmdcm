from config.celery import app
import logging
logger = logging.getLogger(__name__)


@app.task(name='apps.calls.tasks.cleanup_stale_calls')
def cleanup_stale_calls():
    """Mark ringing calls older than 30 minutes as failed."""
    from django.utils import timezone
    from datetime import timedelta
    from .models import Call
    threshold = timezone.now() - timedelta(minutes=30)
    updated = Call.objects.filter(
        status='ringing', started_at__lt=threshold
    ).update(status='failed', ended_at=timezone.now())
    logger.info(f'Cleaned up {updated} stale calls.')
