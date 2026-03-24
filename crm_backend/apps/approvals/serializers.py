from rest_framework import serializers
from .models        import ApprovalRequest


class ApprovalListSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(
        source="requested_by.get_full_name", read_only=True)
    reviewed_by_name  = serializers.CharField(
        source="reviewed_by.get_full_name",  read_only=True)
    customer_name     = serializers.CharField(
        source="customer.get_full_name",     read_only=True)
    ticket_number     = serializers.IntegerField(
        source="ticket.ticket_number",       read_only=True)

    class Meta:
        model  = ApprovalRequest
        fields = [
            "id", "approval_type", "status",
            "title", "description", "amount",
            "requested_by", "requested_by_name",
            "reviewed_by",  "reviewed_by_name",
            "customer",     "customer_name",
            "ticket",       "ticket_number",
            "lead",
            "review_comment", "reviewed_at",
            "created_at",   "updated_at",
        ]
        read_only_fields = [
            "id", "status",
            "requested_by", "requested_by_name",
            "reviewed_by",  "reviewed_by_name",
            "reviewed_at",  "created_at", "updated_at",
            "customer_name","ticket_number",
        ]


class ApprovalCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ApprovalRequest
        fields = [
            "approval_type", "title", "description",
            "amount", "ticket", "customer", "lead",
        ]

    def create(self, validated_data):
        validated_data["requested_by"] = self.context["request"].user
        return super().create(validated_data)


class ApprovalReviewSerializer(serializers.Serializer):
    review_comment = serializers.CharField(required=False, allow_blank=True)
