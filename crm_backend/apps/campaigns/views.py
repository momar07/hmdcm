from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Campaign, CampaignMember
from .serializers import CampaignSerializer, CampaignMemberSerializer
from .selectors import get_all_campaigns, get_pending_members
from .services import add_customers_to_campaign, update_campaign_status
from apps.common.permissions import IsSupervisor


class CampaignViewSet(viewsets.ModelViewSet):
    serializer_class   = CampaignSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['status', 'campaign_type', 'queue']

    def get_queryset(self):
        return get_all_campaigns()

    @action(detail=True, methods=['post'], url_path='add-customers')
    def add_customers(self, request, pk=None):
        ids   = request.data.get('customer_ids', [])
        count = add_customers_to_campaign(pk, ids)
        return Response({'detail': f'{count} customers added to campaign.'})

    @action(detail=True, methods=['patch'], url_path='status')
    def change_status(self, request, pk=None):
        new_status = request.data.get('status')
        update_campaign_status(pk, new_status)
        return Response({'detail': f'Campaign status updated to {new_status}.'})

    @action(detail=True, methods=['get'], url_path='members')
    def members(self, request, pk=None):
        qs = CampaignMember.objects.filter(campaign_id=pk).select_related('lead')
        serializer = CampaignMemberSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='pending-members')
    def pending_members(self, request, pk=None):
        qs = get_pending_members(pk)
        serializer = CampaignMemberSerializer(qs, many=True)
        return Response(serializer.data)
