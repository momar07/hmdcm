from rest_framework import serializers
from .models import Deal, DealLog


class DealLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.get_full_name', read_only=True, default=None)

    class Meta:
        model  = DealLog
        fields = ['id', 'action', 'old_value', 'new_value', 'note', 'actor_name', 'created_at']


class DealSerializer(serializers.ModelSerializer):
    logs          = DealLogSerializer(many=True, read_only=True)
    stage_name    = serializers.CharField(source='stage.name',                read_only=True)
    stage_color   = serializers.CharField(source='stage.color',               read_only=True)
    assigned_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True)
    lead_name     = serializers.SerializerMethodField()

    class Meta:
        model  = Deal
        fields = [
            'id', 'lead', 'lead_name', 'title', 'description',
            'stage', 'stage_name', 'stage_color',
            'assigned_to', 'assigned_name',
            'value', 'currency', 'source', 'campaign',
            'expected_close_date',
            'won_amount', 'lost_reason', 'won_at', 'lost_at',
            'is_active', 'logs', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_lead_name(self, obj):
        if obj.lead:
            fn = obj.lead.first_name or ''
            ln = obj.lead.last_name  or ''
            return (fn + ' ' + ln).strip() or obj.lead.title
        return None


class DealCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Deal
        fields = [
            'lead', 'title', 'description',
            'stage', 'assigned_to',
            'value', 'currency', 'source', 'campaign',
            'expected_close_date',
        ]
