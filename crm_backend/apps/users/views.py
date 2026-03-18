from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from .models import User, Queue
from .serializers import (UserListSerializer, UserDetailSerializer,
                          UserCreateSerializer, UserUpdateSerializer, QueueSerializer)
from .selectors import get_all_users, get_active_queues
from .services import (create_user, update_user_status,
                       agent_queue_login, agent_queue_pause, agent_queue_logoff)
from apps.common.permissions import IsAdmin, IsSupervisor

class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['role', 'team', 'status', 'is_active']
    search_fields = ['first_name', 'last_name', 'email']

    def get_queryset(self):
        return get_all_users()

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return UserUpdateSerializer
        if self.action == 'retrieve':
            return UserDetailSerializer
        return UserListSerializer

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = create_user(**serializer.validated_data)
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path='status')
    def set_status(self, request, pk=None):
        agent_status = request.data.get('status')
        update_user_status(pk, agent_status)
        return Response({'status': agent_status})



    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Admin resets a user's password."""
        new_password = request.data.get('new_password', '').strip()
        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=400)
        try:
            user = User.objects.get(pk=pk)
            user.set_password(new_password)
            user.save(update_fields=['password'])
            return Response({'success': True, 'message': f'Password reset for {user.get_full_name()}'})
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

    @action(detail=True, methods=['post'], url_path='set-extension')
    def set_extension(self, request, pk=None):
        """Admin sets/updates SIP extension for a user."""
        from .models import Extension
        number    = request.data.get('number', '').strip()
        peer_name = request.data.get('peer_name', '').strip()

        if not number:
            return Response({'error': 'Extension number is required.'}, status=400)

        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

        # check if number is taken by another user
        existing = Extension.objects.filter(number=number).exclude(user=user).first()
        if existing:
            return Response({'error': f'Extension {number} is already assigned to {existing.user.get_full_name()}.'}, status=400)

        ext, created = Extension.objects.update_or_create(
            user=user,
            defaults={
                'number':    number,
                'peer_name': peer_name or f'SIP/{number}',
                'is_active': True,
            }
        )
        return Response({
            'success':   True,
            'created':   created,
            'extension': {'id': str(ext.id), 'number': ext.number, 'peer_name': ext.peer_name},
            'message':   f'Extension {number} {"assigned" if created else "updated"} for {user.get_full_name()}',
        })

class QueueViewSet(viewsets.ModelViewSet):
    serializer_class = QueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get_queryset(self):
        return get_active_queues()


class AgentQueueStatusView(APIView):
    """
    POST /api/users/me/queue-status/
    body: { "action": "login" | "pause" | "logoff", "reason": "Break" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """GET current status + extension info."""
        user = request.user
        ext  = getattr(user, 'extension', None)
        return Response({
            'status':    user.status,
            'extension': ext.number if ext else None,
            'full_name': user.get_full_name(),
        })

    def post(self, request):
        user       = request.user
        act        = request.data.get('action', '').strip()
        reason     = request.data.get('reason', 'Break')

        if act == 'login':
            ok = agent_queue_login(user)
            return Response({
                'success': ok,
                'status':  'available',
                'message': 'Logged in to queue' if ok else 'Login failed (no extension?)',
            })
        elif act == 'pause':
            ok = agent_queue_pause(user, reason)
            return Response({
                'success': ok,
                'status':  'away',
                'message': f'Paused ({reason})',
            })
        elif act == 'logoff':
            ok = agent_queue_logoff(user)
            return Response({
                'success': ok,
                'status':  'offline',
                'message': 'Logged off from queue',
            })
        else:
            return Response(
                {'error': 'action must be login | pause | logoff'},
                status=400
            )


class LiveAgentsView(APIView):
    """
    GET /api/users/live-agents/
    Returns all agents with their current status (for supervisor/admin dashboard).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Extension
        agents = User.objects.filter(
            role__in=['agent', 'supervisor'],
            is_active=True,
        ).prefetch_related('extension')

        data = []
        for u in agents:
            ext = getattr(u, 'extension', None)
            data.append({
                'id':        str(u.id),
                'name':      u.get_full_name(),
                'email':     u.email,
                'role':      u.role,
                'status':    u.status,
                'extension': ext.number if ext else None,
            })

        summary = {
            'available': sum(1 for a in data if a['status'] == 'available'),
            'on_call':   sum(1 for a in data if a['status'] == 'on_call'),
            'away':      sum(1 for a in data if a['status'] == 'away'),
            'offline':   sum(1 for a in data if a['status'] == 'offline'),
            'total':     len(data),
        }

        return Response({'agents': data, 'summary': summary})
