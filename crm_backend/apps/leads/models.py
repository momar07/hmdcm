import uuid
from django.db import models
from apps.common.models import BaseModel


class LeadTag(BaseModel):
    """Tags for leads — replaces CustomerTag"""
    name  = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#6366f1')

    class Meta:
        db_table = 'lead_tags'
        ordering = ['name']

    def __str__(self):
        return self.name


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
    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other')]

    # ── Core identity ─────────────────────────────────────
    title        = models.CharField(max_length=255)
    phone        = models.CharField(max_length=30, db_index=True, blank=True,
                                    help_text='Primary phone — used for incoming call lookup')
    email        = models.EmailField(blank=True, db_index=True)
    first_name   = models.CharField(max_length=150, blank=True, db_index=True)
    last_name    = models.CharField(max_length=150, blank=True, db_index=True)
    gender       = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)
    date_of_birth= models.DateField(null=True, blank=True)
    company      = models.CharField(max_length=200, blank=True)
    address      = models.TextField(blank=True)
    city         = models.CharField(max_length=100, blank=True)
    country      = models.CharField(max_length=100, default='Egypt')

    # ── Relations ──────────────────────────────────────────
    assigned_to  = models.ForeignKey('users.User', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='assigned_leads')
    tags         = models.ManyToManyField(LeadTag, blank=True, related_name='leads')

    # ── Pipeline ───────────────────────────────────────────
    stage        = models.ForeignKey(LeadStage, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    status       = models.ForeignKey(LeadStatus, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    priority     = models.ForeignKey(LeadPriority, null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')

    # ── Business fields ────────────────────────────────────
    source       = models.CharField(max_length=50, choices=SOURCE_CHOICES, default='manual')
    value        = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    description  = models.TextField(blank=True)
    notes        = models.TextField(blank=True, help_text='Internal notes about this lead')
    followup_date = models.DateTimeField(null=True, blank=True)
    classification = models.CharField(max_length=50, default='none')
    lifecycle_stage = models.CharField(max_length=50, default='lead')
    score        = models.IntegerField(default=0)
    converted_to_customer = models.BooleanField(default=False)

    # ── Won/Lost fields ────────────────────────────────────
    won_amount   = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    lost_reason  = models.TextField(blank=True)
    lost_at      = models.DateTimeField(null=True, blank=True)
    won_at       = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)

    # ── Campaign ───────────────────────────────────────────
    campaign     = models.ForeignKey('campaigns.Campaign', null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name='leads')
    is_active    = models.BooleanField(default=True)

    class Meta:
        db_table = 'leads'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['stage',       'assigned_to'], name='leads_status__64a296_idx'),
            models.Index(fields=['followup_date'],               name='leads_followu_b0a7a5_idx'),
            models.Index(fields=['phone'],                       name='leads_phone_idx'),
            models.Index(fields=['first_name', 'last_name'],     name='leads_name_idx'),
        ]

    def __str__(self):
        name = self.get_full_name() or self.title
        return f'{name} ({self.phone or "no phone"})'

    def get_full_name(self):
        if self.first_name or self.last_name:
            return f'{self.first_name} {self.last_name}'.strip()
        # Fallback: parse title "Lead from call — Name"
        if '—' in self.title:
            return self.title.split('—', 1)[1].strip()
        return self.title

    @property
    def primary_phone(self):
        """Compatibility property — returns the lead's phone field."""
        return self.phone or None


class LeadEvent(BaseModel):
    """Audit trail — كل تغيير على الـ Lead يتسجّل هنا"""
    EVENT_CHOICES = [
        ('created',        'Created'),
        ('stage_changed',  'Stage Changed'),
        ('status_changed', 'Status Changed'),
        ('assigned',       'Assigned'),
        ('followup_set',   'Follow-up Scheduled'),
        ('won',            'Won'),
        ('lost',           'Lost'),
        ('note',           'Note Added'),
        ('call_offered',   'Call Offered'),
        ('call_answered',  'Call Answered'),
        ('call_rejected',  'Call Rejected'),
        ('call_no_answer', 'Call No Answer'),
    ]

    lead       = models.ForeignKey('Lead', on_delete=models.CASCADE,
                                   related_name='events')
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    actor      = models.ForeignKey('users.User', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')
    old_value  = models.CharField(max_length=255, blank=True)
    new_value  = models.CharField(max_length=255, blank=True)
    note       = models.TextField(blank=True)

    class Meta:
        db_table = 'lead_events'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.lead_id} | {self.event_type} @ {self.created_at}'
