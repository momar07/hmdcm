import uuid
from django.db import models
from apps.common.models import BaseModel


class Disposition(BaseModel):
    """نتائج المكالمة المعرفة مسبقاً"""
    DIRECTION_CHOICES = [
        ('inbound',  'Inbound'),
        ('outbound', 'Outbound'),
        ('both',     'Both'),
    ]

    name      = models.CharField(max_length=100)
    code      = models.CharField(max_length=50, unique=True)
    color     = models.CharField(max_length=20, default='#6b7280')
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES, default='both')
    requires_note = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    order     = models.PositiveIntegerField(default=0)

    # Legacy fields — kept for backward compat
    requires_followup   = models.BooleanField(default=False)
    default_next_action = models.CharField(max_length=50, default='no_action')

    class Meta:
        db_table = 'dispositions'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class DispositionAction(BaseModel):
    """كل disposition ممكن يكون له أكتر من action"""
    ACTION_CHOICES = [
        ('no_action',       'No Action'),
        ('create_followup', 'Create Follow-up'),
        ('create_lead',     'Create Lead'),
        ('create_ticket',   'Create Ticket'),
        ('change_lead_stage', 'Change Lead Stage'),
        ('mark_won',        'Mark Lead as Won'),
        ('escalate',        'Escalate to Supervisor'),
    ]

    disposition = models.ForeignKey(Disposition, on_delete=models.CASCADE,
                                    related_name='actions')
    action_type = models.CharField(max_length=30, choices=ACTION_CHOICES)
    config      = models.JSONField(default=dict, blank=True)
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'disposition_actions'
        ordering = ['order']

    def __str__(self):
        return f'{self.disposition.name} → {self.action_type}'


class Call(BaseModel):
    DIRECTION_CHOICES = [
        ('inbound',  'Inbound'),
        ('outbound', 'Outbound'),
        ('internal', 'Internal'),
    ]
    STATUS_CHOICES = [
        ('ringing',   'Ringing'),
        ('answered',  'Answered'),
        ('no_answer', 'No Answer'),
        ('busy',      'Busy'),
        ('failed',    'Failed'),
        ('completed', 'Completed'),
    ]

    # Asterisk fields
    uniqueid    = models.CharField(max_length=100, unique=True, null=True, blank=True)
    caller      = models.CharField(max_length=50)
    callee      = models.CharField(max_length=50)
    direction   = models.CharField(max_length=20, choices=DIRECTION_CHOICES, default='outbound')
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES,  default='ringing')
    queue       = models.CharField(max_length=100, blank=True)
    duration    = models.PositiveIntegerField(default=0)
    started_at  = models.DateTimeField(null=True, blank=True)
    ended_at    = models.DateTimeField(null=True, blank=True)

    # Relations
    customer    = models.ForeignKey('customers.Customer', null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='calls')
    agent       = models.ForeignKey('users.User', null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='calls')
    lead        = models.ForeignKey('leads.Lead', null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='calls')

    # Completion status — enforcement
    is_completed      = models.BooleanField(default=False)
    completed_at      = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'calls'
        ordering = ['-started_at']
        indexes  = [
            models.Index(fields=['status', 'agent'],      name='calls_status_0ea02e_idx'),
            models.Index(fields=['started_at'],            name='calls_started_783431_idx'),
            models.Index(fields=['caller'],                name='calls_caller__609c68_idx'),
        ]

    def __str__(self):
        return f'{self.direction} call {self.caller} → {self.callee}'

    @property
    def needs_completion(self):
        """المكالمة المجاوبة اللي لسه ما اتكملتش"""
        return self.status == 'answered' and not self.is_completed


class CallCompletion(BaseModel):
    """
    بيانات إتمام المكالمة — الـ enforcement record.
    كل answered call لازم يكون عندها CallCompletion واحد.
    """
    NEXT_ACTION_CHOICES = [
        ('callback',       'Schedule Callback'),
        ('send_quotation', 'Send Quotation'),
        ('followup_later', 'Follow-up Later'),
        ('close_lead',     'Close Lead'),
        ('no_action',      'No Action Required'),
    ]

    call        = models.OneToOneField(Call, on_delete=models.CASCADE,
                                       related_name='completion')
    disposition = models.ForeignKey(Disposition, on_delete=models.PROTECT,
                                    related_name='completions')
    note        = models.TextField()
    next_action = models.CharField(max_length=50, choices=NEXT_ACTION_CHOICES)

    # Lead stage update
    lead_stage_updated = models.BooleanField(default=False)
    new_lead_stage     = models.ForeignKey('leads.LeadStage', null=True, blank=True,
                                           on_delete=models.SET_NULL,
                                           related_name='call_completions')

    # Follow-up (mandatory لو disposition.requires_followup = True)
    followup_required  = models.BooleanField(default=False)
    followup_due_at    = models.DateTimeField(null=True, blank=True)
    followup_assigned  = models.ForeignKey('users.User', null=True, blank=True,
                                           on_delete=models.SET_NULL,
                                           related_name='assigned_completions')
    followup_type      = models.CharField(max_length=50, blank=True)
    followup_created   = models.ForeignKey('followups.Followup', null=True, blank=True,
                                           on_delete=models.SET_NULL,
                                           related_name='from_completion')

    # Submitted by
    submitted_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='submitted_completions')
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'call_completions'

    def __str__(self):
        return f'Completion for Call {self.call_id}'


class CallEvent(BaseModel):
    call      = models.ForeignKey(Call, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=50)
    data      = models.JSONField(default=dict)

    class Meta:
        db_table = 'call_events'
        ordering = ['created_at']


class CallRecording(BaseModel):
    call     = models.ForeignKey(Call, on_delete=models.CASCADE, related_name='recordings')
    filename = models.CharField(max_length=255)
    url      = models.URLField(blank=True)
    duration = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'call_recordings'

    def __str__(self):
        return f'Recording for {self.call}'


class CallDisposition(BaseModel):
    """Legacy — محتفظ بيه للـ backward compatibility"""
    call        = models.ForeignKey(Call, on_delete=models.CASCADE,
                                    related_name='dispositions')
    disposition = models.ForeignKey(Disposition, on_delete=models.PROTECT)
    note        = models.TextField(blank=True)
    agent       = models.ForeignKey('users.User', null=True, blank=True,
                                    on_delete=models.SET_NULL)

    class Meta:
        db_table = 'call_dispositions'
