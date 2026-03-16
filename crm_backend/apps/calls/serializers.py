from rest_framework import serializers
from .models import Call, CallEvent, CallRecording, CallDisposition, Disposition


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
    customer_name = serializers.SerializerMethodField()
    has_recording = serializers.SerializerMethodField()

    class Meta:
        model  = Call
        fields = [
            'id', 'uniqueid', 'direction', 'status',
            'caller', 'callee',
            'agent', 'agent_name',
            'customer', 'customer_name',
            'duration', 'started_at', 'ended_at',
            'is_completed', 'completed_at',
            'has_recording', 'created_at',
        ]

    def get_agent_name(self, obj):
        if not obj.agent:
            return None
        full = obj.agent.get_full_name() if hasattr(obj.agent, 'get_full_name') else ''
        return full or obj.agent.email

    def get_customer_name(self, obj):
        if not obj.customer:
            return None
        full = obj.customer.get_full_name() if hasattr(obj.customer, 'get_full_name') else ''
        return full or str(obj.customer)

    def get_has_recording(self, obj):
        return hasattr(obj, 'recording') and bool(obj.recording)


class CallDetailSerializer(serializers.ModelSerializer):
    events      = CallEventSerializer(many=True, read_only=True)
    recording   = CallRecordingSerializer(read_only=True)
    agent_name  = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model  = Call
        fields = '__all__'

    def get_agent_name(self, obj):
        if not obj.agent:
            return None
        full = obj.agent.get_full_name() if hasattr(obj.agent, 'get_full_name') else ''
        return full or obj.agent.email

    def get_customer_name(self, obj):
        if not obj.customer:
            return None
        full = obj.customer.get_full_name() if hasattr(obj.customer, 'get_full_name') else ''
        return full or str(obj.customer)


class OriginateCallSerializer(serializers.Serializer):
    phone_number = serializers.CharField(max_length=30)
    customer_id  = serializers.UUIDField(required=False)
    lead_id      = serializers.UUIDField(required=False)
    campaign_id  = serializers.UUIDField(required=False)
