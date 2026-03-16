from django.db.models import QuerySet
from .models import Campaign, CampaignMember


def get_all_campaigns() -> QuerySet:
    return Campaign.objects.select_related('queue', 'created_by').filter(is_active=True)


def get_campaign_by_id(campaign_id) -> Campaign:
    return Campaign.objects.select_related('queue', 'created_by').get(pk=campaign_id)


def get_pending_members(campaign_id) -> QuerySet:
    return CampaignMember.objects.select_related('customer').filter(
        campaign_id=campaign_id, status='pending'
    )


def get_active_campaigns() -> QuerySet:
    return Campaign.objects.filter(is_active=True, status='active')
