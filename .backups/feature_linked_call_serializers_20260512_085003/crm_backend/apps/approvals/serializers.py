from rest_framework import serializers
from .models        import ApprovalRequest


class ApprovalListSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(
        source="requested_by.get_full_name", read_only=True)
    reviewed_by_name  = serializers.CharField(
        source="reviewed_by.get_full_name",  read_only=True)
    lead_name         = serializers.SerializerMethodField()
    lead_phone        = serializers.SerializerMethodField()
    ticket_number     = serializers.IntegerField(
        source="ticket.ticket_number",       read_only=True)

    class Meta:
        model  = ApprovalRequest
        fields = [
            "id", "approval_type", "status",
            "title", "description", "amount",
            "requested_by", "requested_by_name",
            "reviewed_by",  "reviewed_by_name",
            "lead",         "lead_name",     "lead_phone",
            "ticket",       "ticket_number",
            "call",
            "review_comment", "reviewed_at",
            "created_at",   "updated_at",
        ]
        read_only_fields = [
            "id", "status",
            "requested_by", "requested_by_name",
            "reviewed_by",  "reviewed_by_name",
            "reviewed_at",  "created_at", "updated_at",
            "lead_name",    "ticket_number",
        ]

    def get_lead_name(self, obj):
        return obj.lead.get_full_name() if obj.lead else None



    def get_lead_phone(self, obj):
        return obj.lead.phone if obj.lead else None

class ApprovalCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ApprovalRequest
        fields = [
            "approval_type", "title", "description",
            "amount", "ticket", "lead", "call",
        ]

    def create(self, validated_data):
        request = self.context["request"]
        user    = request.user
        validated_data["requested_by"] = user

        # Auto-link the agent's active call if the client didn't supply one.
        if not validated_data.get("call"):
            try:
                from apps.calls.services import get_active_call_for_user
                active_call = get_active_call_for_user(user)
                if active_call:
                    validated_data["call"] = active_call
                    # If no lead was provided either, inherit it from the call.
                    if not validated_data.get("lead") and active_call.lead_id:
                        validated_data["lead"] = active_call.lead
            except Exception:
                # Never block approval creation because of auto-link failure.
                pass

        return super().create(validated_data)


class ApprovalReviewSerializer(serializers.Serializer):
    review_comment = serializers.CharField(required=False, allow_blank=True)
