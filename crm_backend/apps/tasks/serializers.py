from rest_framework import serializers
from .models import Task, TaskLog
from apps.users.models import User


class TaskLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model  = TaskLog
        fields = ['id', 'action', 'detail', 'actor_name', 'created_at']

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor else 'System'


class TaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    is_overdue       = serializers.SerializerMethodField()
    logs             = TaskLogSerializer(many=True, read_only=True)

    # linked object labels
    lead_name        = serializers.SerializerMethodField()
    lead_title       = serializers.SerializerMethodField()
    lead_phone       = serializers.SerializerMethodField()
    ticket_title     = serializers.SerializerMethodField()

    class Meta:
        model  = Task
        fields = [
            'id', 'title', 'description',
            'priority', 'status',
            'action_type',
            'assigned_to', 'assigned_to_name',
            'assigned_by', 'assigned_by_name',
            'lead', 'lead_name', 'lead_title', 'lead_phone',
            'ticket', 'ticket_title',
            'call', 'followup',
            'due_date', 'reminder_at', 'reminder_sent',
            'completed_at', 'comment',
            'is_overdue', 'logs',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['assigned_by', 'completed_at', 'created_at', 'updated_at']

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() if obj.assigned_to else ''

    def get_assigned_by_name(self, obj):
        return obj.assigned_by.get_full_name() if obj.assigned_by else 'System'

    def get_is_overdue(self, obj):
        return obj.is_overdue

    def get_lead_name(self, obj):
        if obj.lead:
            return obj.lead.get_full_name() or obj.lead.title
        return None

    def get_lead_title(self, obj):
        return obj.lead.title if obj.lead else None

    def get_lead_phone(self, obj):
        """Get lead's phone."""
        if obj.lead and obj.lead.phone:
            return obj.lead.phone
        return None

    def get_ticket_title(self, obj):
        return obj.ticket.title if obj.ticket else None


class TaskCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Task
        fields = [
            'title', 'description', 'priority',
            'action_type',
            'assigned_to', 'due_date',
            'reminder_at',
            'lead', 'ticket', 'call', 'followup',
        ]
