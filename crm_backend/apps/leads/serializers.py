from rest_framework import serializers
from .models import Lead, LeadStatus, LeadPriority
from apps.customers.serializers import CustomerListSerializer


class LeadStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadStatus
        fields = '__all__'


class LeadPrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model = LeadPriority
        fields = '__all__'


class LeadListSerializer(serializers.ModelSerializer):
    customer_name  = serializers.CharField(source='customer.get_full_name', read_only=True)
    status_name    = serializers.CharField(source='status.name', read_only=True)
    priority_name  = serializers.CharField(source='priority.name', read_only=True)
    assigned_name  = serializers.CharField(source='assigned_to.get_full_name', read_only=True)

    class Meta:
        model = Lead
        fields = ['id', 'title', 'customer', 'customer_name', 'status', 'status_name',
                  'priority', 'priority_name', 'source', 'assigned_to', 'assigned_name',
                  'value', 'followup_date', 'created_at', 'updated_at']


class LeadDetailSerializer(serializers.ModelSerializer):
    customer  = CustomerListSerializer(read_only=True)
    customer_id = serializers.UUIDField(write_only=True)
    status    = LeadStatusSerializer(read_only=True)
    status_id = serializers.UUIDField(write_only=True, allow_null=True, required=False)
    priority  = LeadPrioritySerializer(read_only=True)
    priority_id = serializers.UUIDField(write_only=True, allow_null=True, required=False)

    class Meta:
        model = Lead
        fields = ['id', 'title', 'customer', 'customer_id', 'status', 'status_id',
                  'priority', 'priority_id', 'source', 'assigned_to', 'campaign',
                  'description', 'value', 'followup_date', 'closed_at',
                  'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
