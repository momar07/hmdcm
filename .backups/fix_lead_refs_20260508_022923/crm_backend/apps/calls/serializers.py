from rest_framework import serializers
from .models import (Call, CallEvent, CallRecording, CallDisposition,
                    Disposition, DispositionAction, CallAgentEvent)


class DispositionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Disposition
        fields = ['id', 'name', 'code', 'color', 'requires_followup',
                  'default_next_action', 'order', 'is_active']


class CallEventSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CallEvent
        fields = ['id', 'event_type', 'data', 'created_at']


class CallRecordingSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CallRecording
        fields = ['id', 'url', 'filename', 'duration']


class CallDispositionSerializer(serializers.ModelSerializer):
    disposition_name = serializers.CharField(
        source='disposition.name', read_only=True)

    class Meta:
        model  = CallDisposition
        fields = ['id', 'disposition', 'disposition_name', 'note', 'created_at']


class CallListSerializer(serializers.ModelSerializer):
    agent_name    = serializers.SerializerMethodField()
    lead_name     = serializers.SerializerMethodField()
    has_recording = serializers.SerializerMethodField()

    class Meta:
        model  = Call
        fields = [
            'id', 'uniqueid', 'direction', 'status',
            'caller', 'caller_name', 'callee',
            'agent', 'agent_name',
            'lead', 'lead_name',
            'duration', 'started_at', 'ended_at',
            'is_completed', 'completed_at',
            'has_recording', 'created_at',
        ]

    def get_agent_name(self, obj):
        if not obj.agent:
            return None
        full = obj.agent.get_full_name() if hasattr(obj.agent, 'get_full_name') else ''
        return full or obj.agent.email

    def get_lead_name(self, obj):
        if not obj.lead:
            return obj.caller or 'Unknown'
        full = obj.lead.get_full_name() if hasattr(obj.lead, 'get_full_name') else ''
        return full or obj.lead.title or obj.caller or 'Unknown'

    def get_has_recording(self, obj):
        return hasattr(obj, 'recording') and bool(obj.recording)


class CallDetailSerializer(serializers.ModelSerializer):
    events      = CallEventSerializer(many=True, read_only=True)
    recording   = CallRecordingSerializer(read_only=True)
    agent_name  = serializers.SerializerMethodField()
    lead_name   = serializers.SerializerMethodField()

    class Meta:
        model  = Call
        fields = '__all__'

    def get_agent_name(self, obj):
        if not obj.agent:
            return None
        full = obj.agent.get_full_name() if hasattr(obj.agent, 'get_full_name') else ''
        return full or obj.agent.email

    def get_lead_name(self, obj):
        if not obj.lead:
            return obj.caller or 'Unknown'
        full = obj.lead.get_full_name() if hasattr(obj.lead, 'get_full_name') else ''
        return full or obj.lead.title or obj.caller or 'Unknown'


class CallAgentEventSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(
        source='agent.get_full_name', read_only=True, default=None
    )

    class Meta:
        model  = CallAgentEvent
        fields = ['id', 'call', 'agent', 'agent_name', 'event_type',
                  'ring_duration', 'note', 'created_at']


class OriginateCallSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=30)
    lead_id      = serializers.UUIDField(required=False)
    campaign_id  = serializers.UUIDField(required=False)


class DispositionActionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DispositionAction
        fields = ['id', 'disposition', 'action_type', 'config', 'order']


class DispositionFullSerializer(serializers.ModelSerializer):
    """للـ Settings page — CRUD كامل مع الـ actions"""
    actions = DispositionActionSerializer(many=True, read_only=True)
    code    = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model  = Disposition
        fields = [
            'id', 'name', 'code', 'color', 'direction',
            'requires_note', 'is_active', 'order', 'actions',
        ]
        read_only_fields = ['id']

    def _auto_code(self, name: str) -> str:
        import re
        return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_') or 'disposition'

    def validate(self, attrs):
        if not attrs.get('code'):
            attrs['code'] = self._auto_code(attrs.get('name', ''))
        return attrs

    def create(self, validated_data):
        # تأكد إن الـ code فريد
        base = validated_data['code']
        code = base
        i = 1
        while Disposition.objects.filter(code=code).exists():
            code = f'{base}_{i}'
            i += 1
        validated_data['code'] = code
        return super().create(validated_data)
