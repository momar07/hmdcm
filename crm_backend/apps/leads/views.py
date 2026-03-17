from rest_framework import viewsets, permissions, status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Lead, LeadStatus, LeadPriority, LeadStage
from .serializers import (LeadListSerializer, LeadDetailSerializer,
                           LeadStatusSerializer, LeadPrioritySerializer,
                           LeadStageSerializer)
from .selectors import get_all_leads
from .services import create_lead, assign_lead, update_lead_status


class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['status', 'priority', 'source',
                          'assigned_to', 'campaign', 'customer', 'stage']

    def get_queryset(self):
        return get_all_leads(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return LeadListSerializer
        return LeadDetailSerializer

    @action(detail=True, methods=['patch'], url_path='assign')
    def assign(self, request, pk=None):
        assign_lead(pk, request.data.get('agent_id'))
        return Response({'detail': 'Lead assigned.'})

    @action(detail=True, methods=['patch'], url_path='status')
    def change_status(self, request, pk=None):
        update_lead_status(pk, request.data.get('status_id'))
        return Response({'detail': 'Status updated.'})

    @action(detail=True, methods=['patch'], url_path='move-stage')
    def move_stage(self, request, pk=None):
        """Move a lead to a different stage (Kanban drag & drop)."""
        stage_id = request.data.get('stage_id')
        if not stage_id:
            return Response(
                {'detail': 'stage_id is required.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        try:
            lead  = self.get_object()
            stage = LeadStage.objects.get(pk=stage_id, is_active=True)
            lead.stage = stage
            from django.utils import timezone
            if stage.is_won:
                lead.won_at = timezone.now()
            elif stage.is_closed and not stage.is_won:
                lead.lost_at = timezone.now()
            lead.save(update_fields=['stage', 'won_at', 'lost_at'])
            return Response({
                'detail':     'Stage updated.',
                'stage_id':   str(stage.id),
                'stage_name': stage.name,
                'stage_slug': stage.slug,
            })
        except LeadStage.DoesNotExist:
            return Response(
                {'detail': 'Stage not found.'},
                status=http_status.HTTP_404_NOT_FOUND,
            )


class LeadStatusViewSet(viewsets.ModelViewSet):
    queryset         = LeadStatus.objects.all().order_by('order')
    serializer_class = LeadStatusSerializer
    permission_classes = [permissions.IsAuthenticated]


class LeadPriorityViewSet(viewsets.ModelViewSet):
    queryset         = LeadPriority.objects.all().order_by('order')
    serializer_class = LeadPrioritySerializer
    permission_classes = [permissions.IsAuthenticated]


class LeadStageViewSet(viewsets.ModelViewSet):
    serializer_class   = LeadStageSerializer
    permission_classes = [IsAuthenticated]
    queryset           = LeadStage.objects.filter(is_active=True).order_by('order')
    http_method_names  = ['get', 'post', 'patch', 'delete']
