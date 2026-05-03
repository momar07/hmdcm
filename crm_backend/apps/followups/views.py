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
    filterset_fields   = ['status', 'followup_type', 'assigned_to', 'lead']

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

    # ── custom actions ──────────────────────────────────────────────

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
        tomorrow = timezone.now() + timezone.timedelta(hours=24)
        qs = self.get_queryset().filter(
            status='pending',
            scheduled_at__lte=tomorrow,
        ).order_by('scheduled_at')[:20]
        serializer = FollowupListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='overdue')
    def overdue(self, request):
        qs = self.get_queryset().filter(
            status='pending',
            scheduled_at__lt=timezone.now(),
        ).order_by('scheduled_at')
        serializer = FollowupListSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    # ── NEW: log-action ─────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='log-action')
    def log_action(self, request, pk=None):
        """
        POST /api/followups/{id}/log-action/
        body: {
            action_type : 'call' | 'whatsapp',
            note        : str (optional),
            call_uniqueid: str (optional) — links the outbound call record to the lead
        }
        Creates a Note record linked to the lead + call (if found).
        This makes the action appear in the lead timeline.
        """
        followup    = self.get_object()
        action_type = request.data.get('action_type', 'call')
        note_text   = (request.data.get('note') or '').strip()
        call_uniqueid = (request.data.get('call_uniqueid') or '').strip()

        # ── Resolve lead ────────────────────────────────────────────
        lead = followup.lead or (followup.call.lead if followup.call else None)

        if not lead:
            return Response(
                {'error': 'No lead linked to this follow-up.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Link outbound call record to lead (if uniqueid provided) ─
        call_record = None
        if call_uniqueid:
            from apps.calls.models import Call
            call_record = Call.objects.filter(uniqueid=call_uniqueid).first()
            if call_record and call_record.lead is None:
                call_record.lead = lead
                call_record.save(update_fields=['lead'])

        # ── Build note content ──────────────────────────────────────
        if action_type == 'whatsapp':
            prefix = '📱 WhatsApp message sent'
        else:
            prefix = '📞 Callback call made'

        content = f'{prefix} — Follow-up: {followup.title}'
        if note_text:
            content += f'\n\n{note_text}'

        # ── Create Note record ──────────────────────────────────────
        from apps.notes.models import Note
        note = Note.objects.create(
            author   = request.user,
            lead     = lead,
            call     = call_record,
            content  = content,
        )

        return Response({
            'id'          : str(note.id),
            'lead_id'     : str(lead.id),
            'content'     : note.content,
            'created_at'  : note.created_at,
            'message'     : 'Action logged to lead timeline.',
        }, status=status.HTTP_201_CREATED)
