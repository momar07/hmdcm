from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from apps.users.models import User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['full_name'] = user.get_full_name()
        token['extension'] = user.extension.number if hasattr(user, 'extension') and user.extension else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        data['user'] = {
            'id':         str(user.id),
            'email':      user.email,
            'first_name': user.first_name,
            'last_name':  user.last_name,
            'full_name':  user.get_full_name(),
            'role':       user.role,
            'team_id':    str(user.team_id) if user.team_id else None,
            'extension':  {
                'id':        str(user.extension.id),
                'number':    user.extension.number,
                'peer_name': user.extension.peer_name,
                'is_active': user.extension.is_active,
                'secret':    user.extension.secret or None,
            } if hasattr(user, 'extension') and user.extension else None,
        }
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)
