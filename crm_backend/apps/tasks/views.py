from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Task, TaskStatus
from .serializers import TaskSerializer, TaskCreateSerializer
from .services import create_task, update_task_status


class TaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['status', 'priority', 'assigned_to']
    search_fields      = ['title', 'description']
    ordering_fields    = ['due_date', 'priority', 'created_at', 'status']
    ordering           = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs   = Task.objects.select_related(
                   'assigned_to', 'assigned_by',
                   'lead', 'ticket', 'call'
                ).prefetch_related('logs__actor')

        # Agents see only their own tasks
        if user.role == 'agent':
            qs = qs.filter(assigned_to=user)

        # Filter by linked object
        lead_id     = self.request.query_params.get('lead')
        ticket_id   = self.request.query_params.get('ticket')
        overdue     = self.request.query_params.get('overdue')

        if lead_id:     qs = qs.filter(lead_id=lead_id)
        if ticket_id:   qs = qs.filter(ticket_id=ticket_id)
        if overdue == 'true':
            qs = qs.filter(
                due_date__lt=timezone.now()
            ).exclude(status__in=['completed', 'cancelled'])

        return qs

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return TaskCreateSerializer
        return TaskSerializer

    def perform_create(self, serializer):
        data        = serializer.validated_data
        assigned_to = data.pop('assigned_to')
        task = create_task(
            assigned_to = assigned_to,
            assigned_by = self.request.user,
            **data,
        )
        # Return full serializer data
        self.created_task = task

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        out = TaskSerializer(self.created_task, context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    # ── Custom Actions ────────────────────────────────────────
    @action(detail=True, methods=['patch'], url_path='start')
    def start(self, request, pk=None):
        task = self.get_object()
        if task.status != TaskStatus.PENDING:
            return Response({'detail': 'Task is not pending.'}, status=400)
        update_task_status(task, TaskStatus.IN_PROGRESS, request.user)
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=['patch'], url_path='complete')
    def complete(self, request, pk=None):
        task    = self.get_object()
        comment = request.data.get('comment', '')
        if task.status == TaskStatus.CANCELLED:
            return Response({'detail': 'Cannot complete a cancelled task.'}, status=400)
        update_task_status(task, TaskStatus.COMPLETED, request.user, comment)
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=['patch'], url_path='cancel')
    def cancel(self, request, pk=None):
        task = self.get_object()
        if task.status in (TaskStatus.COMPLETED, TaskStatus.CANCELLED):
            return Response({'detail': 'Task already closed.'}, status=400)
        update_task_status(task, TaskStatus.CANCELLED, request.user)
        return Response(TaskSerializer(task).data)

    @action(detail=False, methods=['get'], url_path='my-stats')
    def my_stats(self, request):
        from django.db.models import Count, Q
        now = timezone.now()
        qs  = Task.objects.filter(assigned_to=request.user)
        return Response({
            'pending':     qs.filter(status='pending').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'overdue':     qs.filter(due_date__lt=now).exclude(
                               status__in=['completed','cancelled']).count(),
            'completed_today': qs.filter(
                               status='completed',
                               completed_at__date=now.date()).count(),
        })

    @action(detail=False, methods=['get'], url_path='team-stats')
    def team_stats(self, request):
        """Supervisor/admin stats across all agents."""
        if request.user.role not in ('supervisor', 'admin'):
            return Response({'detail': 'Forbidden.'}, status=403)
        now         = timezone.now()
        assigned_to = request.query_params.get('assigned_to')
        qs          = Task.objects.all()
        if assigned_to:
            qs = qs.filter(assigned_to=assigned_to)
        return Response({
            'pending':         qs.filter(status='pending').count(),
            'in_progress':     qs.filter(status='in_progress').count(),
            'overdue':         qs.filter(due_date__lt=now).exclude(
                                   status__in=['completed', 'cancelled']).count(),
            'completed_today': qs.filter(
                                   status='completed',
                                   completed_at__date=now.date()).count(),
        })

