from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone

from .models import Followup
from .serializers import FollowupListSerializer, FollowupDetailSerializer
from .selectors import get_followups, get_due_followups
from .services import (
    complete_followup,
    cancel_followup,
    reschedule_followup,
)


class FollowupViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['status', 'followup_type', 'assigned_to']

    def get_queryset(self):
        return get_followups(user=self.request.user)

    def get_serializer_class(self):
        if self.action in ('list',):
            return FollowupListSerializer
        return FollowupDetailSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    # ── custom actions ────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        complete_followup(pk)
        return Response({'detail': 'Follow-up marked complete.'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        cancel_followup(pk)
        return Response({'detail': 'Follow-up cancelled.'})

    @action(detail=True, methods=['post'], url_path='reschedule')
    def reschedule(self, request, pk=None):
        new_date = request.data.get('scheduled_at')
        if not new_date:
            return Response(
                {'error': 'scheduled_at is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reschedule_followup(pk, new_date)
        return Response({'detail': 'Follow-up rescheduled.'})

    @action(detail=False, methods=['get'], url_path='upcoming')
    def upcoming(self, request):
        """Return pending follow-ups due in the next 24 hours."""
        tomorrow = timezone.now() + timezone.timedelta(hours=24)
        qs = self.get_queryset().filter(
            status='pending',
            scheduled_at__lte=tomorrow,
        ).order_by('scheduled_at')[:20]
        serializer = FollowupListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='overdue')
    def overdue(self, request):
        """Return overdue pending follow-ups."""
        qs = self.get_queryset().filter(
            status='pending',
            scheduled_at__lt=timezone.now(),
        ).order_by('scheduled_at')
        serializer = FollowupListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)
