from rest_framework import serializers
from .models import SavedReport


class SavedReportSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SavedReport
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
