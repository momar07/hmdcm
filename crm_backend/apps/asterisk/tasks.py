import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='apps.asterisk.tasks.start_ami_listener')
def start_ami_listener(self):
    """
    Long-running Celery task that maintains the AMI connection.
    Start once with: celery -A config worker -Q ami --concurrency=1
    """
    logger.info('[AMI] Starting listener task...')
    from apps.asterisk.ami_client import AMIClient
    client = AMIClient()
    try:
        client.run()   # blocks until stopped
    except Exception as e:
        logger.error(f'[AMI] Fatal error: {e}')
        raise self.retry(exc=e, countdown=15, max_retries=999)
