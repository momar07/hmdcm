from rest_framework import serializers
from .models import IntegrationSetting


class IntegrationSettingSerializer(serializers.ModelSerializer):
    value = serializers.SerializerMethodField()

    class Meta:
        model  = IntegrationSetting
        fields = ['id', 'key', 'value', 'is_secret', 'updated_by', 'updated_at']
        read_only_fields = ['id', 'updated_at', 'updated_by']

    def get_value(self, obj):
        if obj.is_secret:
            return '***'
        return obj.value


class IntegrationSettingWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = IntegrationSetting
        fields = ['key', 'value', 'is_secret']

    def create(self, validated_data):
        validated_data['updated_by'] = self.context['request'].user
        instance, _ = IntegrationSetting.objects.update_or_create(
            key=validated_data['key'],
            defaults=validated_data,
        )
        return instance
