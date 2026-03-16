import uuid
from django.db import models


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('login',  'Login'),
        ('logout', 'Logout'),
        ('export', 'Export'),
        ('call',   'Call Action'),
    ]

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='audit_logs'
    )
    action      = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    model_name  = models.CharField(max_length=100, blank=True, db_index=True)
    object_id   = models.CharField(max_length=100, blank=True, db_index=True)
    object_repr = models.CharField(max_length=300, blank=True)
    changes     = models.JSONField(default=dict, blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.CharField(max_length=300, blank=True)
    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f'[{self.action}] {self.model_name}:{self.object_id} by {self.user}'


class ActivityLog(models.Model):
    """Lightweight activity feed — human-readable event stream."""
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='activity_logs'
    )
    verb        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    extra       = models.JSONField(default=dict, blank=True)
    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)

    # Optional targets
    customer    = models.ForeignKey(
        'customers.Customer', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='activity_logs'
    )
    lead        = models.ForeignKey(
        'leads.Lead', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='activity_logs'
    )
    call        = models.ForeignKey(
        'calls.Call', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='activity_logs'
    )

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.user} {self.verb}'
