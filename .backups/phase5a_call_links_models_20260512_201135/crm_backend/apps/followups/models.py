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

    # ── Creation context ─────────────────────────────────────
    creation_reason = models.TextField(
        blank=True,
        help_text="Why this followup was scheduled (auto-filled from call note if linked)",
    )

    class Meta:
        db_table = 'followups'
        ordering = ['scheduled_at']
        indexes = [models.Index(fields=['status', 'assigned_to', 'scheduled_at'])]

    def __str__(self):
        return f'{self.title} @ {self.scheduled_at}'


class FollowupCallLink(models.Model):
    """Many-to-many link between Followup and Call with audit metadata."""

    LINK_REASON_CHOICES = [
        ("originating",      "Originating Call"),
        ("auto_during_call", "Auto-linked During Call"),
        ("manual",           "Manually Linked"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    followup = models.ForeignKey(
        Followup, on_delete=models.CASCADE, related_name="call_links",
    )
    call = models.ForeignKey(
        "calls.Call", on_delete=models.CASCADE, related_name="followup_links",
    )
    reason = models.CharField(max_length=20, choices=LINK_REASON_CHOICES, default="auto_during_call")
    action_summary = models.TextField(blank=True, default="")
    linked_at = models.DateTimeField(auto_now_add=True)
    linked_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="followup_call_links_created",
    )
    unlinked_at = models.DateTimeField(null=True, blank=True)
    unlinked_by = models.ForeignKey(
        "users.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="followup_call_links_unlinked",
    )

    class Meta:
        db_table = "followups_call_link"
        unique_together = [("followup", "call")]
        ordering = ["-linked_at"]
        indexes = [
            models.Index(fields=["followup", "unlinked_at"]),
            models.Index(fields=["call"]),
        ]

    def __str__(self):
        return f"FollowupCallLink({self.followup_id} ↔ {self.call_id})"

