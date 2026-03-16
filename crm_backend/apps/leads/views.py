from rest_framework import viewsets, permissions, status as http_status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Lead, LeadStatus, LeadPriority
from .serializers import LeadListSerializer, LeadDetailSerializer, LeadStatusSerializer, LeadPrioritySerializer
from .selectors import get_all_leads
from .services import create_lead, assign_lead, update_lead_status


class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'priority', 'source', 'assigned_to', 'campaign', 'customer']

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


class LeadStatusViewSet(viewsets.ModelViewSet):
    queryset = LeadStatus.objects.all().order_by('order')
    serializer_class = LeadStatusSerializer
    permission_classes = [permissions.IsAuthenticated]


class LeadPriorityViewSet(viewsets.ModelViewSet):
    queryset = LeadPriority.objects.all().order_by('level')
    serializer_class = LeadPrioritySerializer
    permission_classes = [permissions.IsAuthenticated]
