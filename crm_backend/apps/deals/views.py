from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.utils import timezone
from .models import Deal, DealLog
from .serializers import DealSerializer, DealCreateSerializer


class DealViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['lead', 'stage', 'assigned_to', 'is_active']
    search_fields      = ['title', 'lead__first_name', 'lead__last_name']
    ordering_fields    = ['created_at', 'value', 'expected_close_date']
    ordering           = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs   = Deal.objects.select_related(
            'lead', 'stage', 'assigned_to', 'campaign'
        ).prefetch_related('logs__actor')
        if user.role == 'agent':
            qs = qs.filter(assigned_to=user)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return DealCreateSerializer
        return DealSerializer

    def perform_create(self, serializer):
        deal = serializer.save(
            assigned_to=serializer.validated_data.get('assigned_to', self.request.user)
        )
        DealLog.objects.create(
            deal=deal, actor=self.request.user,
            action='Deal created', new_value=deal.title
        )
        from apps.leads.services import _update_lifecycle
        if deal.lead.lifecycle_stage in ('lead', 'prospect'):
            _update_lifecycle(deal.lead, 'opportunity', actor=self.request.user)

    @action(detail=True, methods=['post'], url_path='move-stage')
    def move_stage(self, request, pk=None):
        deal     = self.get_object()
        stage_id = request.data.get('stage_id')
        if not stage_id:
            return Response({'detail': 'stage_id required.'}, status=400)
        from apps.leads.models import LeadStage
        try:
            stage = LeadStage.objects.get(pk=stage_id, is_active=True)
        except LeadStage.DoesNotExist:
            return Response({'detail': 'Stage not found.'}, status=404)
        old_name   = deal.stage.name if deal.stage else '—'
        deal.stage = stage
        fields     = ['stage']
        if stage.is_won:
            deal.won_at = timezone.now()
            fields.append('won_at')
            from apps.leads.services import _update_lifecycle
            from apps.leads.scoring import add_score_event
            _update_lifecycle(deal.lead, 'customer', actor=request.user)
            add_score_event(deal.lead, 'quotation_accepted', reason=f'Deal won: {deal.title}')
        elif stage.is_closed:
            deal.lost_at = timezone.now()
            fields.append('lost_at')
        deal.save(update_fields=fields)
        DealLog.objects.create(
            deal=deal, actor=request.user,
            action='Stage changed', old_value=old_name, new_value=stage.name
        )
        return Response(DealSerializer(deal).data)

    @action(detail=True, methods=['post'], url_path='mark-won')
    def mark_won(self, request, pk=None):
        deal = self.get_object()
        deal.won_at    = timezone.now()
        deal.won_amount = request.data.get('won_amount')
        deal.save(update_fields=['won_at', 'won_amount'])
        from apps.leads.services import _update_lifecycle
        from apps.leads.scoring import add_score_event
        _update_lifecycle(deal.lead, 'customer', actor=request.user)
        add_score_event(deal.lead, 'quotation_accepted', reason=f'Deal won: {deal.title}')
        DealLog.objects.create(deal=deal, actor=request.user, action='Deal marked won')
        return Response(DealSerializer(deal).data)

    @action(detail=True, methods=['post'], url_path='mark-lost')
    def mark_lost(self, request, pk=None):
        deal = self.get_object()
        deal.lost_at     = timezone.now()
        deal.lost_reason = request.data.get('lost_reason', '')
        deal.save(update_fields=['lost_at', 'lost_reason'])
        from apps.leads.services import _update_lifecycle
        _update_lifecycle(deal.lead, 'churned', actor=request.user)
        DealLog.objects.create(deal=deal, actor=request.user, action='Deal marked lost')
        return Response(DealSerializer(deal).data)
