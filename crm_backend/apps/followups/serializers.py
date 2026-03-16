from rest_framework import serializers
from .models import Followup


class FollowupSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    assigned_name = serializers.CharField(source='assigned_to.get_full_name', read_only=True)

    class Meta:
        model = Followup
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
