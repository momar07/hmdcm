from .models import Campaign, CampaignMember


def create_campaign(name, campaign_type, created_by, **kwargs) -> Campaign:
    return Campaign.objects.create(
        name=name, campaign_type=campaign_type,
        created_by=created_by, **kwargs
    )


def add_customers_to_campaign(campaign_id, customer_ids: list) -> int:
    members = [
        CampaignMember(campaign_id=campaign_id, customer_id=cid)
        for cid in customer_ids
    ]
    created = CampaignMember.objects.bulk_create(members, ignore_conflicts=True)
    return len(created)


def update_campaign_status(campaign_id, new_status: str):
    Campaign.objects.filter(pk=campaign_id).update(status=new_status)


def mark_member_called(member_id, call_id):
    CampaignMember.objects.filter(pk=member_id).update(
        status='called',
        last_call_id=call_id,
        attempts=models.F('attempts') + 1,
    )
