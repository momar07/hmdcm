import uuid
from django.db import models
from apps.common.models import BaseModel


class Campaign(BaseModel):
    STATUS_CHOICES = [
        ('draft','Draft'), ('active','Active'), ('paused','Paused'),
        ('completed','Completed'), ('cancelled','Cancelled'),
    ]
    TYPE_CHOICES = [
        ('outbound','Outbound Calling'), ('inbound','Inbound Queue'), ('blended','Blended'),
    ]

    name          = models.CharField(max_length=300)
    description   = models.TextField(blank=True)
    campaign_type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='outbound')
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    queue         = models.ForeignKey(
        'users.Queue', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='campaigns'
    )
    start_date    = models.DateField(null=True, blank=True)
    end_date      = models.DateField(null=True, blank=True)
    daily_limit   = models.PositiveIntegerField(default=0)
    created_by    = models.ForeignKey(
        'users.User', on_delete=models.PROTECT, related_name='created_campaigns'
    )
    is_active     = models.BooleanField(default=True)

    class Meta:
        db_table = 'campaigns'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class CampaignMember(BaseModel):
    STATUS_CHOICES = [
        ('pending','Pending'), ('called','Called'), ('answered','Answered'),
        ('do_not_call','Do Not Call'), ('completed','Completed'),
    ]
    campaign  = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='members')
    lead      = models.ForeignKey('leads.Lead', on_delete=models.CASCADE, null=True, blank=True)
    status    = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    attempts  = models.PositiveIntegerField(default=0)
    # last_call FK added in campaigns/0002 (after calls table exists)

    class Meta:
        db_table = 'campaign_members'
        unique_together = [('campaign', 'lead')]

    def __str__(self):
        return f'{self.campaign} — {self.lead}'
