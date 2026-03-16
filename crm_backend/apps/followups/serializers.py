from rest_framework import serializers
from .models import Followup
from apps.customers.serializers import CustomerListSerializer


class FollowupListSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    assigned_name = serializers.SerializerMethodField()
    is_overdue    = serializers.SerializerMethodField()

    class Meta:
        model  = Followup
        fields = [
            'id', 'title', 'followup_type', 'status',
            'scheduled_at', 'completed_at',
            'customer', 'customer_name',
            'lead', 'call',
            'assigned_to', 'assigned_name',
            'is_overdue', 'reminder_sent',
            'created_at', 'updated_at',
        ]

    def get_customer_name(self, obj):
        c = obj.customer
        return f"{c.first_name} {c.last_name}".strip() if c else ''

    def get_assigned_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else ''

    def get_is_overdue(self, obj):
        from django.utils import timezone
        return obj.status == 'pending' and obj.scheduled_at < timezone.now()


class FollowupDetailSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    assigned_name = serializers.SerializerMethodField()
    is_overdue    = serializers.SerializerMethodField()

    # write-only FK fields
    customer_id   = serializers.UUIDField(write_only=True)
    assigned_to_id = serializers.UUIDField(write_only=True, required=False)
    lead_id       = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    call_id       = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model  = Followup
        fields = [
            'id',
            'customer', 'customer_id', 'customer_name',
            'lead', 'lead_id',
            'call', 'call_id',
            'assigned_to', 'assigned_to_id', 'assigned_name',
            'title', 'description', 'followup_type',
            'scheduled_at', 'completed_at',
            'status', 'reminder_sent', 'is_overdue',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'customer', 'assigned_to', 'lead', 'call',
                            'completed_at', 'reminder_sent', 'created_at', 'updated_at']

    def get_customer_name(self, obj):
        c = obj.customer
        return f"{c.first_name} {c.last_name}".strip() if c else ''

    def get_assigned_name(self, obj):
        u = obj.assigned_to
        return f"{u.first_name} {u.last_name}".strip() if u else ''

    def get_is_overdue(self, obj):
        from django.utils import timezone
        return obj.status == 'pending' and obj.scheduled_at < timezone.now()

    def create(self, validated_data):
        from .services import create_followup
        customer_id   = validated_data.pop('customer_id')
        assigned_to_id = validated_data.pop('assigned_to_id', None)
        lead_id       = validated_data.pop('lead_id', None)
        call_id       = validated_data.pop('call_id', None)

        request = self.context.get('request')
        if not assigned_to_id and request:
            assigned_to_id = request.user.id

        return create_followup(
            customer_id=customer_id,
            assigned_to_id=assigned_to_id,
            lead_id=lead_id,
            call_id=call_id,
            **validated_data,
        )

    def update(self, instance, validated_data):
        # pop write-only FK fields if accidentally passed on update
        validated_data.pop('customer_id', None)
        validated_data.pop('assigned_to_id', None)
        validated_data.pop('lead_id', None)
        validated_data.pop('call_id', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
