import uuid
from django.db import models
from apps.common.models import BaseModel


class LeadStatus(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name       = models.CharField(max_length=100, unique=True)
    color      = models.CharField(max_length=7, default='#6366f1')
    order      = models.PositiveIntegerField(default=0)
    is_closed  = models.BooleanField(default=False)
    is_won     = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = 'lead_statuses'
        ordering = ['order']

    def __str__(self):
        return self.name


class LeadPriority(models.Model):
    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name  = models.CharField(max_length=50, unique=True)
    level = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default='#64748b')

    class Meta:
        db_table = 'lead_priorities'
        ordering = ['level']

    def __str__(self):
        return self.name


class Lead(BaseModel):
    SOURCE_CHOICES = [
        ('call',       'Inbound Call'),
        ('web',        'Website'),
        ('referral',   'Referral'),
        ('campaign',   'Campaign'),
        ('social',     'Social Media'),
        ('walk_in',    'Walk-in'),
        ('email',      'Email'),
        ('manual',     'Manual Entry'),
        ('other',      'Other'),
    ]

    customer      = models.ForeignKey(
        'customers.Customer', on_delete=models.CASCADE, related_name='leads'
    )
    title         = models.CharField(max_length=300)
    status        = models.ForeignKey(
        LeadStatus, on_delete=models.PROTECT, related_name='leads',
        null=True, blank=True
    )
    priority      = models.ForeignKey(
        LeadPriority, on_delete=models.PROTECT, related_name='leads',
        null=True, blank=True
    )
    source        = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    assigned_to   = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assigned_leads'
    )
    campaign      = models.ForeignKey(
        'campaigns.Campaign', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='leads'
    )
    description   = models.TextField(blank=True)
    value         = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    followup_date = models.DateTimeField(null=True, blank=True, db_index=True)
    closed_at     = models.DateTimeField(null=True, blank=True)
    is_active     = models.BooleanField(default=True)

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'assigned_to']),
            models.Index(fields=['followup_date']),
        ]

    def __str__(self):
        return f'{self.title} — {self.customer}'
