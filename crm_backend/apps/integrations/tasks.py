from config.celery import app
import logging

logger = logging.getLogger(__name__)


@app.task(name='apps.integrations.tasks.sync_cdr_task', queue='calls')
def sync_cdr_task():
    """Celery beat task — runs every 60 s to pull CDR from Asterisk MySQL."""
    from .services import sync_cdr_records
    sync_cdr_records()


@app.task(name='apps.integrations.tasks.process_ami_event', queue='calls')
def process_ami_event(event_data: dict):
    """
    Celery task to process a single AMI event dict.
    Enqueued by the AMI listener daemon.
    """
    from .services import handle_call_event
    try:
        handle_call_event(event_data)
    except Exception as exc:
        logger.error(f'[AMI Task] Failed to process event: {exc}')
