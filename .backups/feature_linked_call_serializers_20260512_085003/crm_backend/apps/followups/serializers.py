from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Followup

User = get_user_model()


class FollowupListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    lead_title       = serializers.SerializerMethodField()
    lead_name        = serializers.SerializerMethodField()
    lead_phone       = serializers.SerializerMethodField()

    class Meta:
        model = Followup
        fields = [
            'id', 'lead', 'lead_title', 'call',
            'assigned_to', 'assigned_to_name',
            'lead_name', 'lead_phone',
            'title', 'description', 'followup_type',
            'scheduled_at', 'completed_at', 'status',
            'reminder_sent', 'created_at', 'updated_at',
        ]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else None

    def get_lead_title(self, obj):
        return obj.lead.get_display_name() if obj.lead else None

    def _get_lead(self, obj):
        if obj.lead:
            return obj.lead
        if obj.call and obj.call.lead:
            return obj.call.lead
        return None

    def get_lead_name(self, obj):
        lead = self._get_lead(obj)
        if not lead: return None
        return lead.get_display_name()

    def get_lead_phone(self, obj):
        lead = self._get_lead(obj)
        if not lead: return None
        return lead.phone or (obj.call.caller if obj.call else None)


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
            'id', 'lead', 'assigned_to',
            'created_at', 'updated_at',
        ]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else None

    def get_lead_title(self, obj):
        return obj.lead.get_display_name() if obj.lead else None

    def create(self, validated_data):
        lead_id = validated_data.pop('lead_id', None)
        request = self.context.get('request')
        user    = request.user if request else None
        assigned_to = user

        # Auto-link active call (and inherit its lead if none provided)
        call_obj = validated_data.get('call')
        if user and not call_obj:
            try:
                from apps.calls.services import get_active_call_for_user
                active_call = get_active_call_for_user(user)
                if active_call:
                    validated_data['call'] = active_call
                    if not lead_id and active_call.lead_id:
                        lead_id = str(active_call.lead_id)
            except Exception:
                pass

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
