import re
import uuid
from django.db     import models, connection
from django.conf   import settings
from django.utils  import timezone


# ═══════════════════════════════════════════════════════════════════
# CHOICES / ENUMS
# ═══════════════════════════════════════════════════════════════════

class TicketStatus(models.TextChoices):
    OPEN        = "open",        "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    PENDING     = "pending",     "Pending"
    RESOLVED    = "resolved",    "Resolved"
    CLOSED      = "closed",      "Closed"


class TicketPriority(models.TextChoices):
    LOW    = "low",    "Low"
    MEDIUM = "medium", "Medium"
    HIGH   = "high",   "High"
    URGENT = "urgent", "Urgent"


class TicketType(models.TextChoices):
    COMPLAINT = "complaint", "Complaint"
    REQUEST   = "request",   "Request"
    INQUIRY   = "inquiry",   "Inquiry"


class TicketSource(models.TextChoices):
    CALL   = "call",   "Phone Call"
    MANUAL = "manual", "Manual (Agent)"
    EMAIL  = "email",  "Email"
    PORTAL = "portal", "Customer Portal"
    SYSTEM = "system", "System (Auto)"


class NoteVisibility(models.TextChoices):
    INTERNAL = "internal", "Internal"   # agents only
    PUBLIC   = "public",   "Public"     # visible to customer


class AttachmentType(models.TextChoices):
    FILE           = "file",           "File"
    IMAGE          = "image",          "Image"
    CALL_RECORDING = "call_recording", "Call Recording"


# ═══════════════════════════════════════════════════════════════════
# TAG
# ═══════════════════════════════════════════════════════════════════

class Tag(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name       = models.CharField(max_length=50, unique=True, db_index=True)
    color      = models.CharField(max_length=7, default="#6B7280")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tickets_tag"
        ordering = ["name"]

    def __str__(self):
        return self.name


# ═══════════════════════════════════════════════════════════════════
# SLA POLICY
# ═══════════════════════════════════════════════════════════════════

class SLAPolicy(models.Model):
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name                = models.CharField(max_length=100)
    priority            = models.CharField(
                            max_length=10,
                            choices=TicketPriority.choices,
                            unique=True,
                            db_index=True,
                          )
    first_response_hrs  = models.PositiveIntegerField(default=4)
    resolution_hrs      = models.PositiveIntegerField(default=24)

    # Business hours support
    business_hours_only = models.BooleanField(
                            default=False,
                            help_text="Calculate SLA only during business hours"
                          )
    work_start_hour     = models.PositiveSmallIntegerField(default=9)
    work_end_hour       = models.PositiveSmallIntegerField(default=18)

    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table            = "tickets_sla_policy"
        verbose_name        = "SLA Policy"
        verbose_name_plural = "SLA Policies"

    def __str__(self):
        return f"{self.name} ({self.priority})"


# ═══════════════════════════════════════════════════════════════════
# TICKET
# ═══════════════════════════════════════════════════════════════════

class Ticket(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_number = models.PositiveIntegerField(unique=True, editable=False, db_index=True)

    # ── Core ─────────────────────────────────────────────────────
    title       = models.CharField(max_length=255, db_index=True)
    description = models.TextField(blank=True)
    ticket_type = models.CharField(
                    max_length=20,
                    choices=TicketType.choices,
                    default=TicketType.INQUIRY,
                    db_index=True,
                  )
    category    = models.CharField(max_length=100, blank=True, db_index=True)
    status      = models.CharField(
                    max_length=20,
                    choices=TicketStatus.choices,
                    default=TicketStatus.OPEN,
                    db_index=True,
                  )
    priority    = models.CharField(
                    max_length=10,
                    choices=TicketPriority.choices,
                    default=TicketPriority.MEDIUM,
                    db_index=True,
                  )
    source      = models.CharField(
                    max_length=20,
                    choices=TicketSource.choices,
                    default=TicketSource.MANUAL,
                    db_index=True,
                  )
    direction  = models.CharField(
                    max_length=10,
                    choices=[("inbound","Inbound"),("outbound","Outbound"),("internal","Internal")],
                    null=True, blank=True,
                    db_index=True,
                )

    # ── Relationships ────────────────────────────────────────────
    lead       = models.ForeignKey(
                   "leads.Lead",
                   on_delete=models.SET_NULL,
                   null=True, blank=True,
                   related_name="tickets",
                   db_index=True,
                 )
    agent      = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL,
                   null=True, blank=True,
                   related_name="assigned_tickets",
                   db_index=True,
                 )
    created_by = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL,
                   null=True,
                   related_name="created_tickets",
                 )
    tags       = models.ManyToManyField(Tag, blank=True, related_name="tickets")

    # ── Call center fields ───────────────────────────────────────
    phone_number            = models.CharField(max_length=30,  blank=True, db_index=True)
    phone_number_normalized = models.CharField(max_length=20,  blank=True, db_index=True)
    asterisk_call_id        = models.CharField(max_length=100, blank=True, db_index=True,
                               help_text="Raw Asterisk UniqueID string")
    call                    = models.ForeignKey(
                               "calls.Call",
                               on_delete=models.SET_NULL,
                               null=True, blank=True,
                               related_name="tickets",
                               db_index=True,
                             )
    queue                   = models.CharField(max_length=100, blank=True, db_index=True)

    # ── Denormalized snapshot (no JOIN needed on list view) ──────
    customer_name  = models.CharField(max_length=255, blank=True)
    customer_email = models.CharField(max_length=255, blank=True)

    # ── SLA ──────────────────────────────────────────────────────
    sla_policy             = models.ForeignKey(
                               SLAPolicy,
                               on_delete=models.SET_NULL,
                               null=True, blank=True,
                             )
    first_response_at      = models.DateTimeField(null=True, blank=True)
    response_time_deadline = models.DateTimeField(null=True, blank=True, db_index=True)
    resolution_deadline    = models.DateTimeField(null=True, blank=True, db_index=True)
    sla_breached           = models.BooleanField(default=False, db_index=True)
    sla_response_breached  = models.BooleanField(default=False)

    # ── Escalation ───────────────────────────────────────────────
    is_escalated    = models.BooleanField(default=False, db_index=True)
    escalated_at    = models.DateTimeField(null=True, blank=True)
    escalated_to    = models.ForeignKey(
                        settings.AUTH_USER_MODEL,
                        on_delete=models.SET_NULL,
                        null=True, blank=True,
                        related_name="escalated_tickets",
                      )
    escalation_note = models.TextField(blank=True)

    # ── Counters (updated via signals — no COUNT query needed) ───
    note_count       = models.PositiveIntegerField(default=0)
    attachment_count = models.PositiveIntegerField(default=0)

    # ── Flexible metadata ────────────────────────────────────────
    meta = models.JSONField(
             default=dict, blank=True,
             help_text="Flexible key-value store for custom fields"
           )

    # ── Timestamps ───────────────────────────────────────────────
    created_at  = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at  = models.DateTimeField(auto_now=True,     db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "tickets_ticket"
        ordering = ["-updated_at"]
        indexes  = [
            models.Index(fields=["status", "priority"],
                         name="idx_ticket_status_priority"),
            models.Index(fields=["agent", "status", "-updated_at"],
                         name="idx_ticket_agent_status_upd"),
            models.Index(fields=["lead", "status"],
                         name="idx_ticket_lead_status"),
            models.Index(fields=["status", "-created_at"],
                         name="idx_ticket_status_created"),
            models.Index(fields=["resolution_deadline"],
                         name="idx_ticket_resolution_dl"),
            models.Index(fields=["sla_breached", "status"],
                         name="idx_ticket_sla_breached"),
            models.Index(fields=["source", "status"],
                         name="idx_ticket_source_status"),
            models.Index(fields=["is_escalated", "status"],
                         name="idx_ticket_escalated"),
        ]

    def __str__(self):
        return f"#{self.ticket_number} — {self.title}"

    # ── ticket_number via PostgreSQL sequence ────────────────────
    def save(self, *args, **kwargs):
        if not self.ticket_number:
            with connection.cursor() as c:
                c.execute("SELECT nextval('ticket_number_seq')")
                self.ticket_number = c.fetchone()[0]
        if self.phone_number:
            self.phone_number_normalized = re.sub(r"\D", "", self.phone_number)[-9:]
        super().save(*args, **kwargs)

    # ── Computed properties ──────────────────────────────────────
    @property
    def is_overdue(self) -> bool:
        if self.resolution_deadline and self.status not in (
            TicketStatus.RESOLVED, TicketStatus.CLOSED
        ):
            return timezone.now() > self.resolution_deadline
        return False

    @property
    def response_overdue(self) -> bool:
        if self.response_time_deadline and not self.first_response_at:
            return timezone.now() > self.response_time_deadline
        return False

    # ── SLA calculation ──────────────────────────────────────────
    def apply_sla(self):
        try:
            policy = self.sla_policy or SLAPolicy.objects.get(
                priority=self.priority, is_active=True
            )
            now = timezone.now()
            self.response_time_deadline = now + timezone.timedelta(
                hours=policy.first_response_hrs
            )
            self.resolution_deadline = now + timezone.timedelta(
                hours=policy.resolution_hrs
            )
            self.sla_policy = policy
        except SLAPolicy.DoesNotExist:
            pass


# ═══════════════════════════════════════════════════════════════════
# TICKET NOTE
# ═══════════════════════════════════════════════════════════════════

class TicketNote(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket     = models.ForeignKey(
                   Ticket,
                   on_delete=models.CASCADE,
                   related_name="notes",
                   db_index=True,
                 )
    author     = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL,
                   null=True,
                   related_name="ticket_notes",
                 )
    content    = models.TextField()
    visibility = models.CharField(
                   max_length=10,
                   choices=NoteVisibility.choices,
                   default=NoteVisibility.INTERNAL,
                   db_index=True,
                 )

    # First response tracking
    is_first_response = models.BooleanField(default=False)

    # Edit tracking
    edited_at = models.DateTimeField(null=True, blank=True)
    edited_by = models.ForeignKey(
                  settings.AUTH_USER_MODEL,
                  on_delete=models.SET_NULL,
                  null=True, blank=True,
                  related_name="+",
                )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "tickets_note"
        ordering = ["created_at"]
        indexes  = [
            models.Index(fields=["ticket", "visibility"],
                         name="idx_note_ticket_visibility"),
            models.Index(fields=["ticket", "-created_at"],
                         name="idx_note_ticket_created"),
        ]

    def __str__(self):
        return f"Note on #{self.ticket.ticket_number} by {self.author}"


# ═══════════════════════════════════════════════════════════════════
# TICKET ATTACHMENT
# ═══════════════════════════════════════════════════════════════════

class TicketAttachment(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket      = models.ForeignKey(
                    Ticket,
                    on_delete=models.CASCADE,
                    related_name="attachments",
                    db_index=True,
                  )
    note        = models.ForeignKey(
                    TicketNote,
                    on_delete=models.SET_NULL,
                    null=True, blank=True,
                    related_name="attachments",
                  )
    uploaded_by = models.ForeignKey(
                    settings.AUTH_USER_MODEL,
                    on_delete=models.SET_NULL,
                    null=True,
                    related_name="ticket_attachments",
                  )

    # File fields
    file_name       = models.CharField(max_length=255)
    file_path       = models.CharField(max_length=500)
    file_size       = models.BigIntegerField(null=True, blank=True)
    mime_type       = models.CharField(max_length=100, blank=True)
    attachment_type = models.CharField(
                        max_length=20,
                        choices=AttachmentType.choices,
                        default=AttachmentType.FILE,
                        db_index=True,
                      )

    # Call recording link
    asterisk_call_id = models.CharField(max_length=100, blank=True, db_index=True)
    call             = models.ForeignKey(
                         "calls.Call",
                         on_delete=models.SET_NULL,
                         null=True, blank=True,
                         related_name="ticket_attachments",
                       )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "tickets_attachment"
        indexes  = [
            models.Index(fields=["ticket", "attachment_type"],
                         name="idx_attach_ticket_type"),
        ]

    def __str__(self):
        return f"{self.file_name} → #{self.ticket.ticket_number}"


# ═══════════════════════════════════════════════════════════════════
# TICKET HISTORY (audit log)
# ═══════════════════════════════════════════════════════════════════

class TicketHistory(models.Model):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket    = models.ForeignKey(
                  Ticket,
                  on_delete=models.CASCADE,
                  related_name="history",
                  db_index=True,
                )
    actor     = models.ForeignKey(
                  settings.AUTH_USER_MODEL,
                  on_delete=models.SET_NULL,
                  null=True,
                  related_name="ticket_history_actions",
                )
    field     = models.CharField(max_length=50)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    note      = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "tickets_history"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["ticket", "-created_at"],
                         name="idx_history_ticket_created"),
        ]

    def __str__(self):
        return f"#{self.ticket.ticket_number} | {self.field}: {self.old_value} → {self.new_value}"