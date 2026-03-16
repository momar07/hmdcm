from rest_framework import serializers
from .models import Campaign, CampaignMember


class CampaignSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(
        source='created_by.get_full_name', read_only=True
    )

    class Meta:
        model  = Campaign
        fields = [
            'id', 'name', 'description', 'campaign_type', 'status',
            'queue', 'start_date', 'end_date', 'daily_limit',
            'created_by', 'created_by_name', 'member_count',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def get_member_count(self, obj):
        return obj.members.count()

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class CampaignMemberSerializer(serializers.ModelSerializer):
    customer_name  = serializers.CharField(source='customer.get_full_name', read_only=True)
    customer_phone = serializers.SerializerMethodField()

    class Meta:
        model  = CampaignMember
        fields = [
            'id', 'campaign', 'customer', 'customer_name',
            'customer_phone', 'status', 'attempts', 'last_call',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_customer_phone(self, obj):
        return obj.customer.primary_phone
