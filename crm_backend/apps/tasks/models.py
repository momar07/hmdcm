import uuid
from django.db   import models
from django.conf import settings
from django.utils import timezone


class TaskPriority(models.TextChoices):
    LOW    = 'low',    'Low'
    MEDIUM = 'medium', 'Medium'
    HIGH   = 'high',   'High'
    URGENT = 'urgent', 'Urgent'


class TaskStatus(models.TextChoices):
    PENDING     = 'pending',     'Pending'
    IN_PROGRESS = 'in_progress', 'In Progress'
    COMPLETED   = 'completed',   'Completed'
    CANCELLED   = 'cancelled',   'Cancelled'


class Task(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Core ─────────────────────────────────────────────────
    title       = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    priority    = models.CharField(
                    max_length=10,
                    choices=TaskPriority.choices,
                    default=TaskPriority.MEDIUM,
                    db_index=True,
                  )
    status      = models.CharField(
                    max_length=15,
                    choices=TaskStatus.choices,
                    default=TaskStatus.PENDING,
                    db_index=True,
                  )

    # ── People ───────────────────────────────────────────────
    assigned_to = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.CASCADE,
                    related_name='tasks',
                    db_index=True,
                  )
    assigned_by = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name='assigned_tasks',
                  )

    # ── Action Type ─────────────────────────────────────────
    ACTION_TYPE_CHOICES = [
        ('call_lead',   'Call Lead'),
        ('send_email',  'Send Email'),
        ('follow_up',   'Follow Up'),
        ('send_offer',  'Send Offer'),
        ('other',       'Other'),
    ]
    action_type = models.CharField(
                    max_length=20,
                    choices=ACTION_TYPE_CHOICES,
                    default='other',
                    db_index=True,
                  )

    # ── Reminder ─────────────────────────────────────────────
    reminder_at      = models.DateTimeField(null=True, blank=True,
                         help_text='When to remind the agent about this task')
    reminder_sent    = models.BooleanField(default=False)

    # ── Optional Links ───────────────────────────────────────
    lead        = models.ForeignKey(
                    'leads.Lead',
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name='tasks',
                    db_index=True,
                  )
    ticket      = models.ForeignKey(
                    'tickets.Ticket',
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name='tasks',
                  )
    call        = models.ForeignKey(
                    'calls.Call',
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name='tasks',
                  )
    followup    = models.ForeignKey(
                    'followups.Followup',
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name='tasks',
                  )

    # ── Timing ───────────────────────────────────────────────
    due_date     = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # ── Agent comment on completion ───────────────────────────
    comment      = models.TextField(blank=True)

    # ── Timestamps ───────────────────────────────────────────
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tasks'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['assigned_to', 'status'],
                         name='idx_task_assignee_status'),
            models.Index(fields=['status', 'due_date'],
                         name='idx_task_status_due'),
            models.Index(fields=['assigned_to', 'priority'],
                         name='idx_task_assignee_priority'),
        ]

    def __str__(self):
        return f'{self.title} [{self.status}] → {self.assigned_to}'

    @property
    def is_overdue(self):
        if self.due_date and self.status not in ('completed', 'cancelled'):
            return timezone.now() > self.due_date
        return False


class TaskLog(models.Model):
    """Audit trail for every status change or comment on a task."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task       = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='logs')
    actor      = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL,
                   null=True, blank=True,
                 )
    action     = models.CharField(max_length=100)   # e.g. "status_changed", "comment_added"
    detail     = models.TextField(blank=True)        # e.g. "pending → in_progress"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'task_logs'
        ordering = ['created_at']

    def __str__(self):
        return f'[{self.task}] {self.action} by {self.actor}'
