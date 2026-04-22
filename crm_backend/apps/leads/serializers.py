"""
leads/serializers.py
"""
from rest_framework import serializers
from apps.leads.models import Lead, LeadStage, LeadStatus, LeadPriority, LeadEvent, ScoreEvent


class LeadStageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadStage
        fields = ['id', 'name', 'slug', 'order', 'color', 'is_closed', 'is_won']


class LeadStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadStatus
        fields = ['id', 'name', 'color', 'order', 'is_closed']


class LeadPrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadPriority
        fields = ['id', 'name', 'order']


class LeadListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for Kanban / list views."""
    stage_name    = serializers.CharField(source='stage.name',    read_only=True, default='')
    stage_color   = serializers.CharField(source='stage.color',   read_only=True, default='')
    priority_name = serializers.CharField(source='priority.name', read_only=True, default='')
    assigned_name = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = [
            'id', 'title', 'first_name', 'last_name', 'phone', 'email',
            'company', 'source', 'value', 'score', 'classification',
            'lifecycle_stage', 'stage', 'stage_name', 'stage_color',
            'priority', 'priority_name', 'assigned_to', 'assigned_name',
            'converted_to_customer', 'converted_at',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'converted_to_customer', 'converted_at',
                            'created_at', 'updated_at']

    def get_assigned_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
        return None


class LeadDetailSerializer(serializers.ModelSerializer):
    """Full serializer for Lead detail / update views."""
    stage_detail    = LeadStageSerializer(source='stage',    read_only=True)
    status_detail   = LeadStatusSerializer(source='status',  read_only=True)
    priority_detail = LeadPrioritySerializer(source='priority', read_only=True)
    assigned_name   = serializers.SerializerMethodField()
    customer_id     = serializers.UUIDField(source='customer.id', read_only=True, default=None)
    customer_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Lead
        fields = [
            'id', 'title',
            'first_name', 'last_name', 'phone', 'email',
            'company', 'address', 'city', 'country',
            'source', 'value', 'description', 'followup_date',
            'score', 'classification', 'lifecycle_stage',
            'stage', 'stage_detail',
            'status', 'status_detail',
            'priority', 'priority_detail',
            'assigned_to', 'assigned_name',
            # Conversion fields
            'converted_to_customer', 'converted_at',
            'customer_id', 'customer_name',
            # Won/Lost
            'won_amount', 'won_at', 'lost_reason', 'lost_at',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'converted_to_customer', 'converted_at',
            'customer_id', 'customer_name',
            'won_at', 'lost_at', 'created_at', 'updated_at',
        ]

    def get_assigned_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
        return None

    def get_customer_name(self, obj):
        if obj.customer:
            return f"{obj.customer.first_name} {obj.customer.last_name}".strip()
        return None


class LeadCreateSerializer(serializers.ModelSerializer):
    """
    Used for creating a new Lead — NO customer field required.
    All contact info is stored directly on the Lead.
    """
    class Meta:
        model  = Lead
        fields = [
            'title', 'first_name', 'last_name', 'phone', 'email',
            'company', 'address', 'city', 'country',
            'source', 'value', 'description', 'followup_date',
            'stage', 'status', 'priority', 'assigned_to',
            'classification', 'lifecycle_stage', 'campaign',
        ]

    def validate_phone(self, value):
        if value:
            import re
            cleaned = re.sub(r'[^0-9+]', '', value)
            if len(cleaned) < 7:
                raise serializers.ValidationError("رقم الهاتف غير صحيح")
            return cleaned
        return value

    def create(self, validated_data):
        from apps.leads.services import create_lead
        request = self.context.get('request')
        actor   = request.user if request else None
        return create_lead(data=validated_data, actor=actor)


class LeadEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model  = LeadEvent
        fields = ['id', 'event_type', 'actor', 'actor_name',
                  'old_value', 'new_value', 'note', 'created_at']

    def get_actor_name(self, obj):
        if obj.actor:
            return f"{obj.actor.first_name} {obj.actor.last_name}".strip()
        return None


class ScoreEventSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ScoreEvent
        fields = ['id', 'event_type', 'points', 'reason', 'created_at']


class MarkWonSerializer(serializers.Serializer):
    won_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )


class MarkLostSerializer(serializers.Serializer):
    lost_reason = serializers.CharField(required=True, max_length=500)
