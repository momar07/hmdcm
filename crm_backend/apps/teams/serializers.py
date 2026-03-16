from rest_framework import serializers
from .models import Team


class TeamSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = ['id', 'name', 'description', 'supervisor', 'is_active',
                  'member_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'member_count']

    def get_member_count(self, obj):
        return obj.members.filter(is_active=True).count()
