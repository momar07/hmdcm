from rest_framework import serializers
from .models import AuditLog, ActivityLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model  = AuditLog
        fields = [
            'id', 'user', 'user_name', 'action', 'model_name',
            'object_id', 'object_repr', 'changes',
            'ip_address', 'timestamp',
        ]
        read_only_fields = fields


class ActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model  = ActivityLog
        fields = [
            'id', 'user', 'user_name', 'verb', 'description',
            'extra', 'lead', 'call', 'timestamp',
        ]
        read_only_fields = fields
