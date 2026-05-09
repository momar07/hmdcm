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
    Enriched with team info and server timestamp for accurate duration display.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
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
            ).select_related('team').prefetch_related('extension')
        # Admin sees everyone
        else:
            agents = User.objects.filter(
                role__in=['agent', 'supervisor'],
                is_active=True,
            ).select_related('team').prefetch_related('extension')

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
                'team_id':      str(u.team_id) if u.team_id else None,
                'team_name':    u.team.name if u.team_id else None,
            })

        summary = {
            'available': sum(1 for a in data if a['status'] == 'available'),
            'on_call':   sum(1 for a in data if a['status'] == 'on_call'),
            'away':      sum(1 for a in data if a['status'] == 'away'),
            'busy':      sum(1 for a in data if a['status'] == 'busy'),
            'offline':   sum(1 for a in data if a['status'] == 'offline'),
            'total':     len(data),
        }

        return Response({
            'agents':     data,
            'summary':    summary,
            'server_now': timezone.now().isoformat(),
        })


class ForceAgentStatusView(APIView):
    """
    POST /api/users/{id}/force-status/
    Body: { "status": "available"|"away"|"offline", "reason": "..." }
    Allows admin/supervisor to forcefully change another agent's status.
    Supervisor can only change their own team members.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        actor = request.user
        if actor.role not in ('admin', 'supervisor'):
            return Response({'error': 'Permission denied.'}, status=403)

        try:
            target = User.objects.get(pk=pk, is_active=True)
        except User.DoesNotExist:
            return Response({'error': 'Agent not found.'}, status=404)

        # Supervisor scope check
        if actor.role == 'supervisor' and target.team_id != actor.team_id:
            return Response({'error': 'Supervisor can only manage own team.'}, status=403)

        new_status = request.data.get('status', '').strip()
        reason     = request.data.get('reason', f'Forced by {actor.get_full_name()}')
        VALID      = ['available', 'away', 'offline']
        if new_status not in VALID:
            return Response(
                {'error': f'status must be one of: {", ".join(VALID)}'},
                status=400,
            )

        from apps.users.agent_state_service import (
            agent_go_available, agent_go_break, agent_go_offline,
        )

        if new_status == 'available':
            result = agent_go_available(target)
        elif new_status == 'away':
            result = agent_go_break(target, reason=reason)
        else:  # offline
            result = agent_go_offline(target)

        # Log who forced the change
        import logging
        logging.getLogger(__name__).info(
            f'[ForceStatus] {actor.email} → {target.email}: {new_status} ({reason})'
        )

        result['forced_by'] = actor.get_full_name()
        return Response(result, status=200 if result.get('success') else 400)


class AgentDetailsView(APIView):
    """
    GET /api/users/{id}/agent-details/
    Returns extended info for the agent drawer:
      - basic info, status, extension, team
      - today's call stats (total, answered, missed, avg duration)
      - recent 5 calls
      - current session start time + total break time today
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        from django.utils import timezone
        from datetime import timedelta
        from apps.calls.models import Call
        from apps.users.models import AgentSession, AgentBreak

        actor = request.user
        try:
            target = User.objects.select_related('team', 'extension').get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'Agent not found.'}, status=404)

        # Permission: admin / self / same-team supervisor
        if actor.role == 'agent' and actor.pk != target.pk:
            return Response({'error': 'Permission denied.'}, status=403)
        if actor.role == 'supervisor' and target.team_id != actor.team_id and actor.pk != target.pk:
            return Response({'error': 'Permission denied.'}, status=403)

        # Today's window (server local)
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Calls today
        calls_today = Call.objects.filter(
            agent=target,
            created_at__gte=today_start,
        ).order_by('-created_at')

        total_calls    = calls_today.count()
        answered_calls = calls_today.filter(status='answered').count()
        missed_calls   = calls_today.filter(status__in=['missed', 'no_answer']).count()
        durations      = [c.duration for c in calls_today if c.duration]
        avg_duration   = int(sum(durations) / len(durations)) if durations else 0

        recent = []
        for c in calls_today[:5]:
            recent.append({
                'id':         str(c.id),
                'lead_name':  c.lead.get_display_name() if c.lead_id else None,
                'caller':     c.caller_number,
                'direction':  c.direction,
                'status':     c.status,
                'duration':   c.duration,
                'created_at': c.created_at.isoformat(),
            })

        # Current session
        cur_session = AgentSession.objects.filter(
            agent=target, logout_at__isnull=True,
        ).order_by('-login_at').first()

        # Total break time today
        breaks_today = AgentBreak.objects.filter(
            agent=target, break_start__gte=today_start,
        )
        total_break_seconds = sum(
            (b.duration_seconds or 0) for b in breaks_today
        )

        ext = getattr(target, 'extension', None)
        return Response({
            'id':         str(target.id),
            'name':       target.get_full_name(),
            'email':      target.email,
            'role':       target.role,
            'status':     target.status,
            'status_since': target.status_since.isoformat() if target.status_since else None,
            'extension':  ext.number if ext else None,
            'team_name':  target.team.name if target.team_id else None,
            'session': {
                'login_at': cur_session.login_at.isoformat() if cur_session else None,
                'duration_seconds': cur_session.duration_seconds if cur_session else None,
            },
            'today_stats': {
                'total':         total_calls,
                'answered':      answered_calls,
                'missed':        missed_calls,
                'avg_duration':  avg_duration,
                'break_seconds': total_break_seconds,
                'break_count':   breaks_today.count(),
            },
            'recent_calls': recent,
            'server_now':   timezone.now().isoformat(),
        })



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
