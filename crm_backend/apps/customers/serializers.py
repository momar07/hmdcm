from rest_framework import serializers
from .models import Customer, CustomerPhone, CustomerTag


class CustomerTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerTag
        fields = ['id', 'name', 'color']


class CustomerPhoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerPhone
        fields = ['id', 'number', 'normalized', 'phone_type', 'is_primary', 'is_active']
        read_only_fields = ['id', 'normalized']


class CustomerListSerializer(serializers.ModelSerializer):
    primary_phone = serializers.ReadOnlyField()
    tags = CustomerTagSerializer(many=True, read_only=True)

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'email', 'company',
                  'primary_phone', 'tags', 'assigned_to', 'is_active',
                  'created_at', 'updated_at']


class CustomerDetailSerializer(serializers.ModelSerializer):
    phones = CustomerPhoneSerializer(many=True, read_only=True)
    tags = CustomerTagSerializer(many=True, read_only=True)
    tag_ids = serializers.PrimaryKeyRelatedField(
        many=True, queryset=CustomerTag.objects.all(),
        write_only=True, source='tags', required=False
    )

    class Meta:
        model = Customer
        fields = ['id', 'first_name', 'last_name', 'email', 'gender',
                  'date_of_birth', 'address', 'city', 'country', 'company',
                  'notes', 'phones', 'tags', 'tag_ids', 'assigned_to',
                  'source', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
