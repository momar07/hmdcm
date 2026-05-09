from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from .models import User, Queue
from .serializers import (UserListSerializer, UserDetailSerializer,
                          UserCreateSerializer, UserUpdateSerializer, QueueSerializer)
from .selectors import get_all_users, get_active_queues
from .services import create_user, update_user_status
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

        # SIP secret (optional)
        secret = request.data.get('secret', '').strip()

        # VICIdial fields (optional)
        vicidial_user     = request.data.get('vicidial_user',     '').strip()
        vicidial_pass     = request.data.get('vicidial_pass',     '').strip()
        vicidial_campaign = request.data.get('vicidial_campaign', '').strip()
        vicidial_ingroup  = request.data.get('vicidial_ingroup',  '').strip()

        raw_ids   = request.data.get('queue_ids', [])
        queue_ids = raw_ids if isinstance(raw_ids, list) else []

        defaults = {
            'number':    number,
            'peer_name': peer_name or number,
            'is_active': True,
        }
        if secret:            defaults['secret']            = secret
        if vicidial_user:     defaults['vicidial_user']     = vicidial_user
        if vicidial_pass:     defaults['vicidial_pass']     = vicidial_pass
        if vicidial_campaign: defaults['vicidial_campaign'] = vicidial_campaign
        if vicidial_ingroup:  defaults['vicidial_ingroup']  = vicidial_ingroup

        ext, created = Extension.objects.update_or_create(
            user=user,
            defaults=defaults,
        )

        # Save queue assignments if provided
        if queue_ids is not None:
            from .models import Queue as QueueModel
            valid_queues = QueueModel.objects.filter(id__in=queue_ids, is_active=True)
            ext.queues.set(valid_queues)

        return Response({
            'success':   True,
            'created':   created,
            'extension': {
                'id':          str(ext.id),
                'number':      ext.number,
                'peer_name':   ext.peer_name,
                'queue_names': list(ext.queues.values_list('name', flat=True)),
            },
            'message':   f'Extension {number} {"assigned" if created else "updated"} for {user.get_full_name()}',
        })

class QueueViewSet(viewsets.ModelViewSet):
    serializer_class = QueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get_queryset(self):
        return get_active_queues()


class AgentQueueStatusView(APIView):
    """
    GET  /api/users/me/queue-status/  — return current status + extension
    POST /api/users/me/queue-status/  — body: { "status": "available"|"away"|"offline"|"on_call" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        ext  = getattr(user, 'extension', None)
        return Response({
            'status':    user.status,
            'extension': ext.number if ext else None,
            'full_name': user.get_full_name(),
        })

    def post(self, request):
        user           = request.user
        new_status     = request.data.get('status', '').strip()
        reason         = request.data.get('reason', 'Break')
        VALID_STATUSES = ['available', 'away', 'offline', 'on_call', 'busy']

        if new_status not in VALID_STATUSES:
            return Response(
                {'error': f'status must be one of: {", ".join(VALID_STATUSES)}'},
                status=400,
            )

        from apps.users.agent_state_service import (
            agent_go_available,
            agent_go_break,
            agent_go_offline,
        )
        from apps.users.services import update_user_status

        if new_status == 'available':
            result = agent_go_available(user)
        elif new_status == 'away':
            result = agent_go_break(user, reason=reason)
        elif new_status == 'offline':
            result = agent_go_offline(user)
        else:
            # on_call / busy — set by AMI events, not manually
            update_user_status(str(user.id), new_status)
            result = {'success': True, 'status': new_status, 'message': f'Status set to {new_status}'}

        http_status = 200 if result.get('success') else 400
        return Response(result, status=http_status)

class LiveAgentsView(APIView):
    """
    GET /api/users/live-agents/
    Returns all agents with their current status (for supervisor/admin dashboard).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Extension
        user = request.user

        # Agent sees only themselves
        if user.role == 'agent':
            agents = User.objects.filter(pk=user.pk)
        # Supervisor sees their team only
        elif user.role == 'supervisor' and user.team_id:
            agents = User.objects.filter(
                role='agent',
                team=user.team,
                is_active=True,
            ).prefetch_related('extension')
        # Admin sees everyone
        else:
            agents = User.objects.filter(
                role__in=['agent', 'supervisor'],
                is_active=True,
            ).prefetch_related('extension')

        data = []
        for u in agents:
            ext = getattr(u, 'extension', None)
            data.append({
                'id':           str(u.id),
                'name':         u.get_full_name(),
                'email':        u.email,
                'role':         u.role,
                'status':       u.status,
                'status_since': u.status_since.isoformat() if u.status_since else None,
                'extension':    ext.number if ext else None,
            })

        summary = {
            'available': sum(1 for a in data if a['status'] == 'available'),
            'on_call':   sum(1 for a in data if a['status'] == 'on_call'),
            'away':      sum(1 for a in data if a['status'] == 'away'),
            'offline':   sum(1 for a in data if a['status'] == 'offline'),
            'total':     len(data),
        }

        return Response({'agents': data, 'summary': summary})


class QueuesListView(APIView):
    """
    GET /api/users/queues/
    Returns all active queues — used by frontend queue assignment dropdown.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Queue as QueueModel
        from .serializers import QueueSerializer
        queues = QueueModel.objects.filter(is_active=True).order_by('name')
        return Response({
            'count':   queues.count(),
            'results': QueueSerializer(queues, many=True).data,
        })
