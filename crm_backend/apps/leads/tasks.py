from config.celery import app
import logging
logger = logging.getLogger(__name__)


@app.task(name='apps.leads.tasks.check_overdue_leads')
def check_overdue_leads():
    """Flag leads that have passed their follow-up date without action."""
    from .selectors import get_leads_for_followup
    leads = get_leads_for_followup()
    logger.info(f'Found {leads.count()} overdue leads.')
