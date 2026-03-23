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

        # SIP secret (optional)
        secret = request.data.get('secret', '').strip()

        # VICIdial fields (optional)
        vicidial_user     = request.data.get('vicidial_user',     '').strip()
        vicidial_pass     = request.data.get('vicidial_pass',     '').strip()
        vicidial_campaign = request.data.get('vicidial_campaign', '').strip()
        vicidial_ingroup  = request.data.get('vicidial_ingroup',  '').strip()

        defaults = {
            'number':    number,
            'peer_name': peer_name or f'SIP/{number}',
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
        user   = request.user
        act    = request.data.get('action', '').strip()
        reason = request.data.get('reason', 'Break')

        if act == 'sync_status':
            # Check real VICIdial status on page load
            import pymysql
            from django.conf import settings
            ext       = getattr(user, 'extension', None)
            agent_num = (ext.vicidial_user or ext.number) if ext else None

            real_status = 'offline'
            if agent_num:
                try:
                    conn = pymysql.connect(
                        host   = getattr(settings, 'VICIDIAL_DB_HOST', '192.168.2.222'),
                        port   = getattr(settings, 'VICIDIAL_DB_PORT', 3306),
                        user   = getattr(settings, 'VICIDIAL_DB_USER', 'cron'),
                        passwd = getattr(settings, 'VICIDIAL_DB_PASS', '1234'),
                        db     = getattr(settings, 'VICIDIAL_DB_NAME', 'asterisk'),
                        connect_timeout=3,
                    )
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT status, pause_code FROM vicidial_live_agents WHERE user=%s",
                            (agent_num,)
                        )
                        row = cur.fetchone()
                    conn.close()
                    if row:
                        vd_status = row[0]
                        vd_pause  = row[1]
                        if vd_status == 'READY':
                            real_status = 'available'
                        elif vd_status == 'INCALL':
                            real_status = 'on_call'
                        elif vd_status == 'PAUSED' and vd_pause in ('LOGIN', '', None):
                            real_status = 'offline'
                        elif vd_status == 'PAUSED':
                            real_status = 'away'
                        elif vd_status == 'DISPO':
                            real_status = 'busy'
                        # else: offline (not in table)
                    # Update CRM DB to match real status
                    if user.status != real_status:
                        from apps.users.services import update_user_status
                        update_user_status(str(user.id), real_status)
                except Exception as e:
                    pass

            return Response({
                'success': True,
                'status':  real_status,
                'message': f'Real VICIdial status: {real_status}',
            })

        if act == 'open_session':
            ext          = getattr(user, 'extension', None)
            vicidial_url = ext.vicidial_login_url if ext else None

            # If agent is on Break → skip iframe, just send RESUME
            if user.status == 'away':
                return Response({
                    'success':     True,
                    'status':      user.status,
                    'resume_only': True,
                    'message':     'Agent on break — resume only',
                })

            # Fresh login — return URL for iframe
            return Response({
                'success':      True,
                'status':       user.status,
                'resume_only':  False,
                'message':      'Session URL ready — open iframe',
                'vicidial_url': vicidial_url,
            })

        elif act == 'login':
            # Step 2: iframe loaded — RESUME + DB validation
            ext          = getattr(user, 'extension', None)
            vicidial_url = ext.vicidial_login_url if ext else None
            result       = agent_queue_login(user)
            return Response({
                'success':      result['success'],
                'status':       result['status'],
                'message':      result['message'],
                'vicidial_url': vicidial_url,
            }, status=200 if result['success'] else 400)
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
