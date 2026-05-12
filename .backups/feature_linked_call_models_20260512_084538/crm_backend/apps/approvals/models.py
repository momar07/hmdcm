import uuid
from django.db     import models
from django.conf   import settings


class ApprovalType(models.TextChoices):
    REFUND     = "refund",     "Refund"
    DISCOUNT   = "discount",   "Discount"
    EXCEPTION  = "exception",  "Exception"
    LEAVE      = "leave",      "Leave"
    OTHER      = "other",      "Other"


class ApprovalStatus(models.TextChoices):
    PENDING   = "pending",   "Pending"
    APPROVED  = "approved",  "Approved"
    REJECTED  = "rejected",  "Rejected"
    CANCELLED = "cancelled", "Cancelled"


class ApprovalRequest(models.Model):
    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Core ─────────────────────────────────────────────────
    approval_type  = models.CharField(
                       max_length=20,
                       choices=ApprovalType.choices,
                       default=ApprovalType.OTHER,
                       db_index=True,
                     )
    status         = models.CharField(
                       max_length=20,
                       choices=ApprovalStatus.choices,
                       default=ApprovalStatus.PENDING,
                       db_index=True,
                     )
    title          = models.CharField(max_length=255)
    description    = models.TextField(blank=True)
    amount         = models.DecimalField(
                       max_digits=10, decimal_places=2,
                       null=True, blank=True,
                       help_text="Optional — for refund/discount requests"
                     )

    # ── People ────────────────────────────────────────────────
    requested_by = models.ForeignKey(
                     settings.AUTH_USER_MODEL,
                     on_delete=models.CASCADE,
                     related_name="approval_requests",
                     db_index=True,
                   )
    reviewed_by  = models.ForeignKey(
                     settings.AUTH_USER_MODEL,
                     on_delete=models.SET_NULL,
                     null=True, blank=True,
                     related_name="reviewed_approvals",
                   )

    # ── Optional links ────────────────────────────────────────
    ticket   = models.ForeignKey(
                 "tickets.Ticket",
                 on_delete=models.SET_NULL,
                 null=True, blank=True,
                 related_name="approval_requests",
                 db_index=True,
               )
    lead     = models.ForeignKey(
                 "leads.Lead",
                 on_delete=models.SET_NULL,
                 null=True, blank=True,
                 related_name="approval_requests",
                 db_index=True,
               )
    call     = models.ForeignKey(
                 "calls.Call",
                 on_delete=models.SET_NULL,
                 null=True, blank=True,
                 related_name="approval_requests",
                 db_index=True,
                 help_text="Auto-linked when the approval is requested during a live call",
               )

    # ── Review ────────────────────────────────────────────────
    review_comment = models.TextField(blank=True)
    reviewed_at    = models.DateTimeField(null=True, blank=True)

    # ── Timestamps ────────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "approvals_request"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["status", "-created_at"],
                         name="idx_approval_status_created"),
            models.Index(fields=["requested_by", "status"],
                         name="idx_approval_requester_status"),
        ]

    def __str__(self):
        return f"{self.approval_type} — {self.title} [{self.status}]"
