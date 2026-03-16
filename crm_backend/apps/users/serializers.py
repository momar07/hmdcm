from rest_framework import serializers
from .models import User, Extension, Queue


class ExtensionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Extension
        fields = ['id', 'number', 'peer_name', 'is_active']
        read_only_fields = ['id']


class UserListSerializer(serializers.ModelSerializer):
    full_name  = serializers.SerializerMethodField()
    team_name  = serializers.SerializerMethodField()
    extension  = ExtensionSerializer(read_only=True)

    class Meta:
        model  = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name',
                  'role', 'status', 'is_active', 'team', 'team_name',
                  'extension', 'avatar']

    def get_full_name(self, obj):
        return obj.get_full_name()

    def get_team_name(self, obj):
        return obj.team.name if obj.team else None


class UserDetailSerializer(UserListSerializer):
    class Meta(UserListSerializer.Meta):
        fields = UserListSerializer.Meta.fields + ['phone', 'created_at', 'updated_at']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model  = User
        fields = ['email', 'first_name', 'last_name', 'role',
                  'team', 'phone', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = ['first_name', 'last_name', 'role', 'team',
                  'phone', 'status', 'is_active']


class QueueSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Queue
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']
