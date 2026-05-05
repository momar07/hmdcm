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
    caller_name = models.CharField(max_length=200, blank=True, default='')
    callee      = models.CharField(max_length=50)
    direction   = models.CharField(max_length=20, choices=DIRECTION_CHOICES, default='outbound')
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES,  default='ringing')
    queue       = models.CharField(max_length=100, blank=True)
    duration    = models.PositiveIntegerField(default=0)
    started_at  = models.DateTimeField(null=True, blank=True)
    ended_at    = models.DateTimeField(null=True, blank=True)

    # Relations
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


class CallAgentEvent(BaseModel):
    """Tracks each agent interaction with a call: offered, answered, rejected, timeout."""
    EVENT_CHOICES = [
        ('offered',   'Call Offered'),
        ('answered',  'Call Answered'),
        ('rejected',  'Call Rejected'),
        ('timeout',   'Ring Timeout'),
        ('ringhangup','Agent Hung Up While Ringing'),
    ]

    call         = models.ForeignKey(Call, on_delete=models.CASCADE,
                                     related_name='agent_events')
    agent        = models.ForeignKey('users.User', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='call_agent_events')
    event_type   = models.CharField(max_length=20, choices=EVENT_CHOICES, db_index=True)
    ring_duration= models.PositiveIntegerField(default=0,
                    help_text='Seconds the agent\'s phone rang before this event')
    note         = models.TextField(blank=True)

    class Meta:
        db_table = 'call_agent_events'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['call', 'event_type']),
            models.Index(fields=['agent', 'event_type']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.call_id} | {self.event_type} by {self.agent}'


class WebhookEvent(BaseModel):
    """
    Idempotency tracker for AMI/webhook events.
    Prevents duplicate processing when Asterisk sends the same event twice.
    """
    EVENT_TYPES = [
        ('incoming',   'Incoming Call'),
        ('answered',   'Call Answered'),
        ('ended',      'Call Ended'),
        ('recording',  'Recording Ready'),
    ]

    uniqueid    = models.CharField(max_length=100, db_index=True)
    event_type  = models.CharField(max_length=20, choices=EVENT_TYPES)
    processed   = models.BooleanField(default=False)
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'webhook_events'
        unique_together = [('uniqueid', 'event_type')]

    def __str__(self):
        return f'{self.event_type} — {self.uniqueid}'


class AutomationRule(BaseModel):
    """Configurable automation rules triggered by call events."""
    TRIGGERS = [
        ('missed_call',   'Missed Call'),
        ('no_answer',     'No Answer'),
        ('vip_call',      'VIP Incoming Call'),
        ('long_call',     'Call Exceeds Duration'),
    ]
    ACTIONS = [
        ('create_callback',  'Create Callback Task'),
        ('notify_manager',   'Notify Manager/Supervisor'),
        ('send_sms',         'Send SMS'),
        ('assign_priority',  'Assign Priority'),
    ]

    name        = models.CharField(max_length=100)
    trigger     = models.CharField(max_length=30, choices=TRIGGERS)
    action      = models.CharField(max_length=30, choices=ACTIONS)
    config      = models.JSONField(default=dict, blank=True,
                                   help_text='Rule-specific config (e.g. delay_hours, vip_tags)')
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table = 'automation_rules'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.trigger} → {self.action})'


class Activity(BaseModel):
    """Unified timeline for leads — calls, followups, notes, emails."""
    TYPE_CHOICES = [
        ('call',     'Call'),
        ('followup', 'Follow-up'),
        ('note',     'Note'),
        ('email',    'Email'),
        ('sms',      'SMS'),
    ]
    STATUS_CHOICES = [
        ('scheduled',   'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('cancelled',   'Cancelled'),
    ]

    lead          = models.ForeignKey('leads.Lead', on_delete=models.CASCADE,
                                      related_name='activities')
    call          = models.ForeignKey(Call, null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name='activities')
    followup      = models.ForeignKey('followups.Followup', null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name='activities')
    agent         = models.ForeignKey('users.User', null=True, blank=True,
                                      on_delete=models.SET_NULL)
    activity_type = models.CharField(max_length=15, choices=TYPE_CHOICES)
    status        = models.CharField(max_length=15, choices=STATUS_CHOICES, default='completed')
    title         = models.CharField(max_length=300)
    description   = models.TextField(blank=True)
    started_at    = models.DateTimeField(null=True, blank=True)
    ended_at      = models.DateTimeField(null=True, blank=True)
    duration      = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'activities'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['lead', 'activity_type']),
            models.Index(fields=['lead', 'status']),
            models.Index(fields=['lead', 'started_at']),
        ]

    def __str__(self):
        return f'{self.activity_type} — {self.title}'
