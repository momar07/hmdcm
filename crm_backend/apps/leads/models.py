import uuid
from django.db import models
from apps.common.models import BaseModel


class LeadStage(BaseModel):
    """مراحل البيع — قابلة للتخصيص من الـ admin"""
    STAGE_CHOICES = [
        ('new',               'New'),
        ('attempted_contact', 'Attempted Contact'),
        ('contacted',         'Contacted'),
        ('qualified',         'Qualified'),
        ('interested',        'Interested'),
        ('quotation_sent',    'Quotation Sent'),
        ('negotiation',       'Negotiation'),
        ('ready_to_close',    'Ready to Close'),
        ('won',               'Won'),
        ('lost',              'Lost'),
    ]
    name       = models.CharField(max_length=100)
    slug       = models.CharField(max_length=50, unique=True, blank=True)
    order      = models.PositiveIntegerField(default=0)
    color      = models.CharField(max_length=20, default='#6b7280')
    is_closed  = models.BooleanField(default=False)  # Won أو Lost
    is_won     = models.BooleanField(default=False)
    is_active  = models.BooleanField(default=True)

    class Meta:
        db_table = 'lead_stages'
        ordering = ['order']

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            import re
            self.slug = re.sub(r'[^a-z0-9]+', '_', self.name.lower()).strip('_')
            # Ensure uniqueness
            base = self.slug
            n = 1
            from apps.leads.models import LeadStage
            while LeadStage.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                self.slug = f"{base}_{n}"
                n += 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class LeadStatus(BaseModel):
    name     = models.CharField(max_length=100)
    color    = models.CharField(max_length=20, default='#6b7280')
    order    = models.PositiveIntegerField(default=0)
    is_closed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'lead_statuses'
        ordering = ['order']

    def __str__(self):
        return self.name


class LeadPriority(BaseModel):
    name  = models.CharField(max_length=50)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'lead_priorities'
        ordering = ['order']

    def __str__(self):
        return self.name


class Lead(BaseModel):
    SOURCE_CHOICES = [
        ('manual',   'Manual'),
        ('call',     'Inbound Call'),
        ('campaign', 'Campaign'),
        ('referral', 'Referral'),
        ('web',      'Website'),
        ('other',    'Other'),
    ]

    # Core fields
    title        = models.CharField(max_length=255)
    customer     = models.ForeignKey('customers.Customer', on_delete=models.CASCADE,
                                     related_name='leads')
    assigned_to  = models.ForeignKey('users.User', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='assigned_leads')

    # Pipeline
    stage        = models.ForeignKey(LeadStage, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    status       = models.ForeignKey(LeadStatus, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    priority     = models.ForeignKey(LeadPriority, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')

    # Business fields
    source       = models.CharField(max_length=50, choices=SOURCE_CHOICES, default='manual')
    value        = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    description  = models.TextField(blank=True)
    followup_date = models.DateTimeField(null=True, blank=True)

    # Won/Lost fields — mandatory للـ enforcement
    won_amount   = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    lost_reason  = models.TextField(blank=True)
    lost_at      = models.DateTimeField(null=True, blank=True)
    won_at       = models.DateTimeField(null=True, blank=True)

    # Campaign
    campaign     = models.ForeignKey('campaigns.Campaign', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    is_active    = models.BooleanField(default=True)

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['stage',       'assigned_to'], name='leads_status__64a296_idx'),
            models.Index(fields=['followup_date'],               name='leads_followu_b0a7a5_idx'),
        ]

    def __str__(self):
        return f'{self.title} — {self.customer}'
