from rest_framework import serializers
from django.utils    import timezone
from apps.calls.services import build_call_detail
from .models import (
    Ticket, TicketNote, TicketAttachment,
    TicketHistory, Tag, SLAPolicy,
)


# ═══════════════════════════════════════════════════════════════════
# TAG
# ═══════════════════════════════════════════════════════════════════

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tag
        fields = ["id", "name", "color"]


# ═══════════════════════════════════════════════════════════════════
# SLA POLICY
# ═══════════════════════════════════════════════════════════════════

class SLAPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model  = SLAPolicy
        fields = [
            "id", "name", "priority",
            "first_response_hrs", "resolution_hrs",
            "business_hours_only", "work_start_hour", "work_end_hour",
            "is_active",
        ]


# ═══════════════════════════════════════════════════════════════════
# TICKET NOTE
# ═══════════════════════════════════════════════════════════════════

class TicketNoteSerializer(serializers.ModelSerializer):
    author_name       = serializers.CharField(source="author.get_full_name", read_only=True)
    author_id         = serializers.UUIDField(source="author.id",            read_only=True)
    is_first_response = serializers.BooleanField(read_only=True)
    ticket            = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model  = TicketNote
        fields = [
            "id", "ticket", "content", "visibility",
            "author_id", "author_name",
            "is_first_response",
            "edited_at", "created_at",
        ]
        read_only_fields = [
            "id", "author_id", "author_name",
            "is_first_response", "edited_at", "created_at",
        ]

    def create(self, validated_data):
        # Auto-assign author from request
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


# ═══════════════════════════════════════════════════════════════════
# TICKET ATTACHMENT
# ═══════════════════════════════════════════════════════════════════

class TicketAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.get_full_name", read_only=True
    )
    file_size_kb = serializers.SerializerMethodField()

    class Meta:
        model  = TicketAttachment
        fields = [
            "id", "ticket", "note",
            "file_name", "file_path", "file_size", "file_size_kb",
            "mime_type", "attachment_type",
            "asterisk_call_id", "call",
            "uploaded_by_name", "created_at",
        ]
        read_only_fields = ["id", "uploaded_by_name", "file_size_kb", "created_at"]

    def get_file_size_kb(self, obj) -> str:
        if obj.file_size:
            return f"{round(obj.file_size / 1024, 1)} KB"
        return "—"

    def create(self, validated_data):
        validated_data["uploaded_by"] = self.context["request"].user
        return super().create(validated_data)


# ═══════════════════════════════════════════════════════════════════
# TICKET HISTORY
# ═══════════════════════════════════════════════════════════════════

class TicketHistorySerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)

    class Meta:
        model  = TicketHistory
        fields = [
            "id", "field", "old_value", "new_value",
            "note", "actor_name", "created_at",
        ]
        read_only_fields = fields


# ═══════════════════════════════════════════════════════════════════
# TICKET — LIST (lightweight, no nested objects)
# ═══════════════════════════════════════════════════════════════════

class TicketListSerializer(serializers.ModelSerializer):
    call_detail = serializers.SerializerMethodField()
    tags            = TagSerializer(many=True, read_only=True)
    agent_name      = serializers.CharField(source="agent.get_full_name",  read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    is_overdue      = serializers.BooleanField(read_only=True)
    response_overdue = serializers.BooleanField(read_only=True)

    # Remaining SLA time in minutes
    sla_remaining_mins = serializers.SerializerMethodField()

    def get_call_detail(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        return build_call_detail(getattr(obj, 'call', None), user)

    class Meta:
        model  = Ticket
        fields = [
            "id", "ticket_number", "title",
            "ticket_type", "category", "source",
            "status", "priority",
            "lead", "customer_name", "customer_email",
            "phone_number", "asterisk_call_id", "queue", "direction",
            "agent_id", "agent_name",
            "created_by_name",
            "sla_breached", "sla_response_breached",
            "resolution_deadline", "response_time_deadline",
            "is_overdue", "response_overdue", "sla_remaining_mins",
            "is_escalated",
            "note_count", "attachment_count",
            "tags",
            "created_at", "updated_at", "resolved_at",
        
            'call_detail', 'creation_reason',
        ]

    def get_sla_remaining_mins(self, obj) -> int | None:
        if obj.resolution_deadline and obj.status not in ("resolved", "closed"):
            delta = obj.resolution_deadline - timezone.now()
            return max(0, int(delta.total_seconds() / 60))
        return None


# ═══════════════════════════════════════════════════════════════════
# TICKET — CREATE
# ═══════════════════════════════════════════════════════════════════

class TicketCreateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True, write_only=True,
        source="tags", required=False,
    )

    class Meta:
        model  = Ticket
        fields = [
            "title", "description",
            "ticket_type", "category", "source", "priority",
            "lead", "agent",
            "phone_number", "asterisk_call_id", "call", "queue", "direction",
            "sla_policy", "meta",
            "tag_ids",
         'creation_reason',]

    def create(self, validated_data):
        tags = validated_data.pop("tags", [])
        user = self.context["request"].user
        validated_data["created_by"] = user

        # Auto-assign agent if not provided
        if not validated_data.get("agent"):
            validated_data["agent"] = user

        # auto-link active call (auto_link_call patch)
        # If the client didn't supply a call, attach the agent's current
        # in-progress call (and inherit its lead if needed).
        if not validated_data.get("call"):
            try:
                from apps.calls.services import get_active_call_for_user, build_call_detail
                active_call = get_active_call_for_user(user)
                if active_call:
                    validated_data["call"] = active_call
                    if not validated_data.get("asterisk_call_id") and active_call.uniqueid:
                        validated_data["asterisk_call_id"] = active_call.uniqueid
                    if not validated_data.get("lead") and active_call.lead_id:
                        validated_data["lead"] = active_call.lead
            except Exception:
                pass

        # Snapshot lead info
        lead = validated_data.get("lead")
        if lead:
            validated_data["customer_name"]  = lead.get_display_name()
            validated_data["customer_email"] = lead.email or ""
            if not validated_data.get("phone_number") and lead.phone:
                validated_data["phone_number"] = lead.phone

        ticket = Ticket.objects.create(**validated_data)
        if tags:
            ticket.tags.set(tags)
        return ticket


# ═══════════════════════════════════════════════════════════════════
# TICKET — UPDATE (PATCH)
# ═══════════════════════════════════════════════════════════════════

class TicketUpdateSerializer(serializers.ModelSerializer):
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True, write_only=True,
        source="tags", required=False,
    )

    class Meta:
        model  = Ticket
        fields = [
            "title", "description",
            "ticket_type", "category", "priority", "status",
            "agent", "sla_policy", "meta",
            "is_escalated", "escalated_to", "escalation_note",
            "tag_ids",
        ]

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if tags is not None:
            instance.tags.set(tags)
        return instance


# ═══════════════════════════════════════════════════════════════════
# TICKET — DETAIL (full nested)
# ═══════════════════════════════════════════════════════════════════

class TicketDetailSerializer(serializers.ModelSerializer):
    tags             = TagSerializer(many=True, read_only=True)
    notes            = TicketNoteSerializer(many=True, read_only=True)
    attachments      = TicketAttachmentSerializer(many=True, read_only=True)
    history          = TicketHistorySerializer(many=True, read_only=True)
    sla_policy_data  = SLAPolicySerializer(source="sla_policy", read_only=True)
    agent_name       = serializers.CharField(source="agent.get_full_name",      read_only=True)
    created_by_name  = serializers.CharField(source="created_by.get_full_name", read_only=True)
    escalated_to_name = serializers.CharField(
        source="escalated_to.get_full_name", read_only=True
    )
    is_overdue        = serializers.BooleanField(read_only=True)
    response_overdue  = serializers.BooleanField(read_only=True)
    sla_remaining_mins = serializers.SerializerMethodField()

    class Meta:
        model  = Ticket
        fields = [
            "id", "ticket_number", "title", "description",
            "ticket_type", "category", "source",
            "status", "priority",
            "lead", "customer_name", "customer_email",
            "phone_number", "phone_number_normalized",
            "asterisk_call_id", "call", "queue",
            "agent", "agent_name",
            "created_by", "created_by_name",
            "sla_policy", "sla_policy_data",
            "first_response_at",
            "response_time_deadline", "resolution_deadline",
            "sla_breached", "sla_response_breached",
            "is_overdue", "response_overdue", "sla_remaining_mins",
            "is_escalated", "escalated_at",
            "escalated_to", "escalated_to_name", "escalation_note",
            "note_count", "attachment_count",
            "meta",
            "resolved_at", "closed_at",
            "created_at", "updated_at",
            "tags", "notes", "attachments", "history",
        ]
        read_only_fields = [
            "id", "ticket_number",
            "customer_name", "customer_email",
            "phone_number_normalized",
            "note_count", "attachment_count",
            "created_at", "updated_at",
        ]

    def get_sla_remaining_mins(self, obj) -> int | None:
        if obj.resolution_deadline and obj.status not in ("resolved", "closed"):
            delta = obj.resolution_deadline - timezone.now()
            return max(0, int(delta.total_seconds() / 60))
        return None
