import uuid
from django.db import models
from apps.common.models import BaseModel


class Followup(BaseModel):
    STATUS_CHOICES = [
        ('pending',    'Pending'),
        ('completed',  'Completed'),
        ('cancelled',  'Cancelled'),
        ('rescheduled','Rescheduled'),
    ]

    TYPE_CHOICES = [
        ('call',    'Call'),
        ('email',   'Email'),
        ('meeting', 'Meeting'),
        ('sms',     'SMS'),
        ('other',   'Other'),
    ]

    customer     = models.ForeignKey(
        'customers.Customer', on_delete=models.CASCADE,
        related_name='followups', null=True, blank=True
    )
    lead         = models.ForeignKey(
        'leads.Lead', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='followups'
    )
    call         = models.ForeignKey(
        'calls.Call', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='followups'
    )
    assigned_to  = models.ForeignKey(
        'users.User', on_delete=models.CASCADE, related_name='followups'
    )
    title        = models.CharField(max_length=300)
    description  = models.TextField(blank=True)
    followup_type= models.CharField(max_length=10, choices=TYPE_CHOICES, default='call')
    scheduled_at = models.DateTimeField(db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    status       = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending')
    reminder_sent= models.BooleanField(default=False)

    class Meta:
        db_table = 'followups'
        ordering = ['scheduled_at']
        indexes = [models.Index(fields=['status', 'assigned_to', 'scheduled_at'])]

    def __str__(self):
        return f'{self.title} @ {self.scheduled_at}'
