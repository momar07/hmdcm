import uuid
from django.db import models
from apps.common.models import BaseModel, TimeStampedModel


class Disposition(TimeStampedModel):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    color       = models.CharField(max_length=7, default='#6366f1')
    requires_followup = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table = 'dispositions'
        ordering = ['name']

    def __str__(self):
        return self.name


class Call(BaseModel):
    DIRECTION_CHOICES = [
        ('inbound',   'Inbound'),
        ('outbound',  'Outbound'),
        ('internal',  'Internal'),
    ]
    STATUS_CHOICES = [
        ('ringing',     'Ringing'),
        ('answered',    'Answered'),
        ('no_answer',   'No Answer'),
        ('busy',        'Busy'),
        ('failed',      'Failed'),
        ('voicemail',   'Voicemail'),
        ('transferred', 'Transferred'),
    ]

    uniqueid       = models.CharField(max_length=100, unique=True, db_index=True)
    linkedid       = models.CharField(max_length=100, blank=True, db_index=True)
    caller_number  = models.CharField(max_length=30, db_index=True)
    callee_number  = models.CharField(max_length=30, db_index=True)
    agent          = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    customer       = models.ForeignKey(
        'customers.Customer', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    extension      = models.ForeignKey(
        'users.Extension', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    queue          = models.ForeignKey(
        'users.Queue', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='calls'
    )
    direction      = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status         = models.CharField(max_length=15, choices=STATUS_CHOICES, default='ringing')
    duration       = models.PositiveIntegerField(default=0)
    wait_time      = models.PositiveIntegerField(default=0)
    started_at     = models.DateTimeField(null=True, blank=True)
    answered_at    = models.DateTimeField(null=True, blank=True)
    ended_at       = models.DateTimeField(null=True, blank=True)
    recording_file = models.CharField(max_length=500, blank=True)
    recording_url  = models.URLField(blank=True)
    # Campaign FK added in 0002 (after campaigns table exists)
    notes          = models.TextField(blank=True)

    class Meta:
        db_table = 'calls'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'agent']),
            models.Index(fields=['started_at']),
            models.Index(fields=['caller_number']),
        ]

    def __str__(self):
        return f'{self.direction} call {self.uniqueid} ({self.status})'

    @property
    def campaign(self):
        from apps.campaigns.models import Campaign
        if self.campaign_id:
            try:
                return Campaign.objects.get(pk=self.campaign_id)
            except Campaign.DoesNotExist:
                return None
        return None


class CallEvent(TimeStampedModel):
    EVENT_CHOICES = [
        ('dial','Dial'), ('answer','Answer'), ('hangup','Hangup'),
        ('transfer','Transfer'), ('hold','Hold'), ('unhold','Unhold'),
        ('dtmf','DTMF'), ('bridge','Bridge'),
    ]
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call      = models.ForeignKey(Call, on_delete=models.CASCADE, related_name='events')
    event     = models.CharField(max_length=20, choices=EVENT_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    data      = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'call_events'
        ordering = ['timestamp']


class CallRecording(TimeStampedModel):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call      = models.OneToOneField(Call, on_delete=models.CASCADE, related_name='recording')
    file_path = models.CharField(max_length=500)
    file_url  = models.URLField(blank=True)
    file_size = models.PositiveIntegerField(default=0)
    format    = models.CharField(max_length=10, default='wav')
    duration  = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'call_recordings'


class CallDisposition(TimeStampedModel):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    call         = models.OneToOneField(Call, on_delete=models.CASCADE, related_name='disposition')
    disposition  = models.ForeignKey(Disposition, on_delete=models.PROTECT)
    agent        = models.ForeignKey('users.User', on_delete=models.PROTECT)
    notes        = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'call_dispositions'
