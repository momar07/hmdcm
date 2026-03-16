from config.celery import app
import logging

logger = logging.getLogger(__name__)


@app.task(name='apps.campaigns.tasks.process_campaign_calls', queue='campaigns')
def process_campaign_calls(campaign_id: str):
    """
    Auto-dial pending campaign members in batches.
    Called manually or via supervisor action.
    """
    from .selectors import get_pending_members
    from apps.integrations.services import originate_call_for_campaign

    members = list(get_pending_members(campaign_id)[:50])
    for member in members:
        try:
            originate_call_for_campaign(member)
        except Exception as exc:
            logger.error(f'Failed to dial {member.customer}: {exc}')

    logger.info(f'Processed {len(members)} campaign calls for campaign {campaign_id}.')
