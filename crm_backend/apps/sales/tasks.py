from celery import shared_task
import logging
logger = logging.getLogger(__name__)

@shared_task
def expire_overdue_quotations():
    from .services import expire_overdue_quotations as _expire
    count = _expire()
    logger.info(f"Celery: expired {count} quotations")
    return count
