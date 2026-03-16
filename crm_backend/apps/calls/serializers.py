from rest_framework import serializers
from .models import Call, CallEvent, CallRecording, CallDisposition, Disposition


class DispositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Disposition
        fields = '__all__'


class CallEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallEvent
        fields = ['id', 'event', 'timestamp', 'data']


class CallRecordingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallRecording
        fields = ['id', 'file_url', 'file_size', 'format', 'duration']


class CallDispositionSerializer(serializers.ModelSerializer):
    disposition_name = serializers.CharField(source='disposition.name', read_only=True)

    class Meta:
        model = CallDisposition
        fields = ['id', 'disposition', 'disposition_name', 'notes', 'submitted_at']


class CallListSerializer(serializers.ModelSerializer):
    agent_name    = serializers.CharField(source='agent.get_full_name', read_only=True)
    customer_name = serializers.SerializerMethodField()
    has_recording = serializers.SerializerMethodField()

    class Meta:
        model = Call
        fields = ['id', 'uniqueid', 'direction', 'status', 'caller_number', 'callee_number',
                  'agent', 'agent_name', 'customer', 'customer_name', 'duration',
                  'started_at', 'ended_at', 'has_recording', 'created_at']

    def get_customer_name(self, obj):
        return obj.customer.get_full_name() if obj.customer else None

    def get_has_recording(self, obj):
        return bool(obj.recording_file)


class CallDetailSerializer(serializers.ModelSerializer):
    events       = CallEventSerializer(many=True, read_only=True)
    recording    = CallRecordingSerializer(read_only=True)
    disposition  = CallDispositionSerializer(read_only=True)

    class Meta:
        model = Call
        fields = '__all__'


class OriginateCallSerializer(serializers.Serializer):
    phone_number  = serializers.CharField(max_length=30)
    customer_id   = serializers.UUIDField(required=False)
    lead_id       = serializers.UUIDField(required=False)
    campaign_id   = serializers.UUIDField(required=False)
