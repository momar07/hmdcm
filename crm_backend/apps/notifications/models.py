import uuid
from django.db import models
from django.conf import settings


class Notification(models.Model):
    """In-app notification stored in PostgreSQL."""

    TYPE_CHOICES = [
        ('task_assigned',     'Task Assigned'),
        ('task_reminder',     'Task Reminder'),
        ('followup_reminder', 'Follow-up Reminder'),
        ('call_incoming',     'Incoming Call'),
        ('call_missed',       'Missed Call'),
        ('vip_call',          'VIP Call'),
        ('quotation_pending', 'Quotation Pending'),
        ('quotation_update',  'Quotation Update'),
        ('approval_needed',   'Approval Needed'),
        ('lead_assigned',     'Lead Assigned'),
        ('system',            'System'),
    ]

    PRIORITY_CHOICES = [
        ('low',    'Low'),
        ('normal', 'Normal'),
        ('high',   'High'),
        ('urgent', 'Urgent'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    type        = models.CharField(max_length=32, choices=TYPE_CHOICES)
    title       = models.CharField(max_length=255)
    body        = models.TextField(blank=True, default='')
    data        = models.JSONField(default=dict, blank=True)
    link        = models.CharField(max_length=512, blank=True, default='')
    priority    = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='normal')
    is_read     = models.BooleanField(default=False)
    read_at     = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read', '-created_at']),
            models.Index(fields=['recipient', '-created_at']),
            models.Index(fields=['type']),
        ]

    def __str__(self):
        return f'[{self.type}] {self.title} -> {self.recipient_id}'

    def mark_read(self):
        from django.utils import timezone
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
