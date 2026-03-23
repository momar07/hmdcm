from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import CustomTokenObtainPairSerializer, ChangePasswordSerializer


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    serializer_class   = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            # Trigger agent login sequence for agents and supervisors
            try:
                from rest_framework_simplejwt.tokens import AccessToken
                token_str = response.data.get('access', '')
                token     = AccessToken(token_str)
                user_id   = str(token.get('user_id', ''))
                from apps.users.models import User
                user = User.objects.select_related('extension').get(pk=user_id)
                if user.role in ('agent', 'supervisor'):
                    from apps.users.agent_state_service import agent_on_login
                    agent_on_login(user, request=request)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'[Login] agent_on_login failed: {e}')
        return response


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Trigger agent logout sequence before blacklisting token
        try:
            user = request.user
            if user.role in ('agent', 'supervisor'):
                from apps.users.agent_state_service import agent_on_logout
                agent_on_logout(user)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'[Logout] agent_on_logout failed: {e}')

        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'detail': 'Invalid token.'}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': str(user.id),
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'full_name': user.get_full_name(),
            'role': user.role,
            'is_active': user.is_active,
            'extension': {
                'id':       str(user.extension.id),
                'number':   user.extension.number,
                'peer_name':user.extension.peer_name,
                'is_active':user.extension.is_active,
                'secret':   user.extension.secret or None,
            } if hasattr(user, 'extension') and user.extension else None,
            'team_id': str(user.team_id) if user.team_id else None,
        })


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'detail': 'Wrong password.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'detail': 'Password changed successfully.'})
