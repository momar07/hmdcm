import uuid
from django.db import models
from apps.common.models import BaseModel


class Deal(BaseModel):
    """Opportunity/Deal — مرتبط بـ Lead، بيمثل صفقة محددة"""

    lead         = models.ForeignKey(
        'leads.Lead', on_delete=models.CASCADE, related_name='deals'
    )
    title        = models.CharField(max_length=255)
    description  = models.TextField(blank=True)
    stage        = models.ForeignKey(
        'leads.LeadStage', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='deals'
    )
    assigned_to  = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='deals'
    )
    value        = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency     = models.CharField(max_length=10, default='EGP')
    source       = models.CharField(max_length=50, blank=True)
    campaign     = models.ForeignKey(
        'campaigns.Campaign', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='deals'
    )
    expected_close_date = models.DateField(null=True, blank=True)
    won_amount   = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    lost_reason  = models.TextField(blank=True)
    won_at       = models.DateTimeField(null=True, blank=True)
    lost_at      = models.DateTimeField(null=True, blank=True)
    is_active    = models.BooleanField(default=True)

    class Meta:
        db_table = 'deals'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['lead', 'stage'],        name='deal_lead_stage_idx'),
            models.Index(fields=['assigned_to', 'stage'], name='deal_agent_stage_idx'),
        ]

    def __str__(self):
        return f'{self.title} — {self.lead}'


class DealLog(BaseModel):
    """Audit trail للـ Deal"""
    deal       = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='logs')
    actor      = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    action     = models.CharField(max_length=100)
    old_value  = models.CharField(max_length=255, blank=True)
    new_value  = models.CharField(max_length=255, blank=True)
    note       = models.TextField(blank=True)

    class Meta:
        db_table = 'deal_logs'
        ordering = ['created_at']

    def __str__(self):
        return f'[{self.deal}] {self.action}'
