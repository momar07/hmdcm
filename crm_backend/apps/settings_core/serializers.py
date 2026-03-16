from rest_framework import serializers
from .models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SystemSetting
        fields = ['id', 'key', 'value', 'description', 'category',
                  'is_public', 'updated_at']
        read_only_fields = ['id', 'updated_at']
