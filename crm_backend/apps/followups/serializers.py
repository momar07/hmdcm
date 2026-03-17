from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Followup

User = get_user_model()


class FollowupListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    lead_title = serializers.SerializerMethodField()

    class Meta:
        model = Followup
        fields = [
            'id', 'lead', 'lead_title', 'call',
            'assigned_to', 'assigned_to_name',
            'title', 'description', 'followup_type',
            'scheduled_at', 'completed_at', 'status',
            'reminder_sent', 'created_at', 'updated_at',
        ]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else None

    def get_lead_title(self, obj):
        return obj.lead.title if obj.lead else None


class FollowupDetailSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    lead_title = serializers.SerializerMethodField()
    lead_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Followup
        fields = [
            'id', 'lead', 'lead_id', 'lead_title', 'call',
            'assigned_to', 'assigned_to_name',
            'title', 'description', 'followup_type',
            'scheduled_at', 'completed_at', 'status',
            'reminder_sent', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'lead', 'assigned_to', 'call',
            'created_at', 'updated_at',
        ]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else None

    def get_lead_title(self, obj):
        return obj.lead.title if obj.lead else None

    def create(self, validated_data):
        lead_id = validated_data.pop('lead_id', None)
        request = self.context.get('request')
        assigned_to = request.user if request else None
        return Followup.objects.create(
            lead_id=lead_id,
            assigned_to=assigned_to,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data.pop('lead_id', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance
