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
from .services import create_lead, assign_lead, update_lead_status, update_lead_stage, update_lead_followup_date


class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['status', 'priority', 'source',
                          'assigned_to', 'campaign', 'stage']

    def get_queryset(self):
        if self.action == 'retrieve':
            # Detail view: allow viewing any active lead by ID
            # Agents may navigate here from an incoming call before assignment propagates
            return Lead.objects.select_related(
                'status', 'priority', 'assigned_to', 'campaign'
            ).filter(is_active=True)
        return get_all_leads(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return LeadListSerializer
        return LeadDetailSerializer

    @action(detail=True, methods=['patch'], url_path='assign')
    def assign(self, request, pk=None):
        assign_lead(pk, request.data.get('agent_id'), actor=request.user)
        return Response({'detail': 'Lead assigned.'})

    @action(detail=True, methods=['patch'], url_path='status')
    def change_status(self, request, pk=None):
        update_lead_status(pk, request.data.get('status_id'), actor=request.user)
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
            lead, stage = update_lead_stage(pk, stage_id, actor=request.user)
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


    @action(detail=True, methods=['get'], url_path='events')
    def events(self, request, pk=None):
        """GET /leads/{id}/events/ — audit trail for the lead."""
        from .models import LeadEvent
        from .serializers import LeadEventSerializer
        qs = LeadEvent.objects.filter(lead_id=pk).select_related('actor').order_by('-created_at')[:100]
        return Response(LeadEventSerializer(qs, many=True).data)

    @action(detail=True, methods=['patch'], url_path='followup-date')
    def set_followup_date(self, request, pk=None):
        """PATCH /leads/{id}/followup-date/ — sets followup_date and auto-creates Followup."""
        date_val = request.data.get('followup_date')
        update_lead_followup_date(pk, date_val, actor=request.user)
        return Response({'detail': 'Follow-up date set.'})

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
