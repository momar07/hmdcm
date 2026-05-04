import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='apps.asterisk.tasks.start_ami_listener')
def start_ami_listener(self):
    """
    Long-running Celery task that maintains the AMI connection.
    Start once with: celery -A config worker -Q ami --concurrency=1

    NOTE: If the AMI listener is already running via AsteriskConfig.ready()
    (inside Daphne), this task should NOT be started to avoid duplicate events.
    Set DISABLE_AMI=1 env var if running this task separately.
    """
    import os
    if os.environ.get('DISABLE_AMI') == '1' or os.environ.get('AMI_STANDALONE') != '1':
        logger.info('[AMI] Skipping standalone listener — AMI is handled by Daphne app config')
        return 'skipped'
    logger.info('[AMI] Starting standalone listener task...')
    from apps.asterisk.ami_client import AMIClient
    client = AMIClient()
    try:
        client.run()   # blocks until stopped
    except Exception as e:
        logger.error(f'[AMI] Fatal error: {e}')
        raise self.retry(exc=e, countdown=15, max_retries=999)
