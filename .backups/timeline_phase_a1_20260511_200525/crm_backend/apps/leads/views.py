from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound
from rest_framework.filters import SearchFilter
from django_filters.rest_framework import DjangoFilterBackend

from apps.auditlog.services import log_activity
from apps.auditlog import constants as audit_actions
from apps.common.utils import get_client_ip

from .models import Lead, LeadStatus, LeadPriority, LeadStage
from .serializers import (LeadListSerializer, LeadDetailSerializer,
                           LeadStatusSerializer, LeadPrioritySerializer,
                           LeadStageSerializer)
from .selectors import get_all_leads
from .services import (create_lead, assign_lead, update_lead_status,
                        update_lead_stage, update_lead_followup_date)


# ── Permission helpers ────────────────────────────────────────────────────
def _can_modify_lead(user, lead):
    """Return True if user may archive/restore this lead.

    - admin            : any lead
    - supervisor       : leads whose assignee is in the supervisor's team
    - agent            : only leads assigned to themselves
    """
    if not user or not user.is_authenticated:
        return False
    if user.role == 'admin':
        return True
    if user.role == 'supervisor':
        if lead.assigned_to and lead.assigned_to.team_id == user.team_id:
            return True
        return False
    if user.role == 'agent':
        return lead.assigned_to_id == user.id
    return False


def _build_extra(request, **kw):
    """Common context for ActivityLog.extra."""
    extra = {'ip': get_client_ip(request)}
    extra.update({k: v for k, v in kw.items() if v is not None})
    return extra


class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter]
    search_fields      = ['full_name', 'phone', 'email', 'company']
    filterset_fields   = ['status', 'priority', 'source',
                          'assigned_to', 'campaign', 'stage']

    # Disable DRF's built-in DELETE; force users through permanent-delete.
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    # ── Querysets ────────────────────────────────────────────────────────
    def get_queryset(self):
        user = self.request.user

        if self.action == 'retrieve':
            # Detail view shows any lead by ID (active or archived) so that
            # restore/archive UI can load the record. Permission checks happen
            # at action level.
            return Lead.objects.select_related(
                'status', 'priority', 'assigned_to', 'campaign'
            )

        if self.action == 'list':
            archived = (self.request.query_params.get('archived') or 'active').lower()

            base = Lead.objects.select_related(
                'status', 'priority', 'assigned_to', 'campaign'
            )

            # Apply role-based scoping (mirrors get_all_leads)
            if user.role == 'agent':
                base = base.filter(assigned_to=user)
            elif user.role == 'supervisor':
                base = base.filter(assigned_to__team=user.team)

            if archived == 'archived':
                return base.filter(is_active=False)
            if archived == 'all':
                # Only admin/supervisor may view both; agents see only active.
                if user.role == 'agent':
                    return base.filter(is_active=True)
                return base
            # default: active
            return base.filter(is_active=True)

        return get_all_leads(user=user)

    def get_serializer_class(self):
        if self.action == 'list':
            return LeadListSerializer
        return LeadDetailSerializer

    # ── Existing actions (unchanged) ─────────────────────────────────────
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
        from .models import LeadEvent
        from .serializers import LeadEventSerializer
        qs = (LeadEvent.objects
              .filter(lead_id=pk)
              .select_related('actor')
              .order_by('-created_at')[:100])
        return Response(LeadEventSerializer(qs, many=True).data)

    @action(detail=True, methods=['patch'], url_path='followup-date')
    def set_followup_date(self, request, pk=None):
        date_val = request.data.get('followup_date')
        update_lead_followup_date(pk, date_val, actor=request.user)
        return Response({'detail': 'Follow-up date set.'})

    # ── New: Archive ─────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """POST /api/leads/{id}/archive/  -> soft-delete (is_active=False)."""
        try:
            lead = Lead.objects.select_related('assigned_to').get(pk=pk)
        except Lead.DoesNotExist:
            raise NotFound('Lead not found.')

        if not _can_modify_lead(request.user, lead):
            raise PermissionDenied('You may only archive leads assigned to you.')

        if not lead.is_active:
            return Response(
                {'detail': 'Lead is already archived.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            lead.is_active = False
            lead.save(update_fields=['is_active', 'updated_at'])

            label = lead.get_display_name()
            extra = _build_extra(
                request,
                lead_phone=lead.phone or None,
                lead_company=lead.company or None,
                role=request.user.role,
            )
            transaction.on_commit(lambda: log_activity(
                user=request.user,
                verb=audit_actions.LEAD_ARCHIVED,
                description=f'Archived lead {label}',
                lead=lead,
                extra=extra,
            ))

        return Response({'detail': 'Lead archived.', 'is_active': False})

    # ── New: Restore ─────────────────────────────────────────────────────
    @action(detail=True, methods=['post'], url_path='restore')
    def restore(self, request, pk=None):
        """POST /api/leads/{id}/restore/  -> set is_active=True."""
        try:
            lead = Lead.objects.select_related('assigned_to').get(pk=pk)
        except Lead.DoesNotExist:
            raise NotFound('Lead not found.')

        if not _can_modify_lead(request.user, lead):
            raise PermissionDenied('You may only restore leads assigned to you.')

        if lead.is_active:
            return Response(
                {'detail': 'Lead is already active.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            lead.is_active = True
            lead.save(update_fields=['is_active', 'updated_at'])

            label = lead.get_display_name()
            extra = _build_extra(
                request,
                lead_phone=lead.phone or None,
                role=request.user.role,
            )
            transaction.on_commit(lambda: log_activity(
                user=request.user,
                verb=audit_actions.LEAD_RESTORED,
                description=f'Restored lead {label}',
                lead=lead,
                extra=extra,
            ))

        return Response({'detail': 'Lead restored.', 'is_active': True})

    # ── New: Permanent delete (admin only) ───────────────────────────────
    @action(detail=True, methods=['post'], url_path='permanent-delete')
    def permanent_delete(self, request, pk=None):
        """POST /api/leads/{id}/permanent-delete/

        Body must contain {"confirmation": "DELETE"}.
        Admin role only. The ActivityLog row keeps target_id and a label
        snapshot but the lead FK becomes NULL after the lead is destroyed.
        """
        if request.user.role != 'admin':
            raise PermissionDenied('Only admins may permanently delete leads.')

        confirmation = (request.data.get('confirmation') or '').strip()
        if confirmation != 'DELETE':
            return Response(
                {'detail': 'Confirmation required: send {"confirmation": "DELETE"}.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        try:
            lead = Lead.objects.get(pk=pk)
        except Lead.DoesNotExist:
            raise NotFound('Lead not found.')

        # Snapshot before deletion — the FK in ActivityLog will become NULL.
        label    = lead.get_display_name()
        lead_id  = str(lead.id)
        phone    = lead.phone or ''
        company  = lead.company or ''
        was_active = lead.is_active

        with transaction.atomic():
            lead.delete()
            extra = _build_extra(
                request,
                deleted_lead_id=lead_id,
                deleted_lead_label=label,
                deleted_lead_phone=phone or None,
                deleted_lead_company=company or None,
                was_active=was_active,
                role=request.user.role,
            )
            transaction.on_commit(lambda: log_activity(
                user=request.user,
                verb=audit_actions.LEAD_DELETED,
                description=f'Permanently deleted lead {label} ({lead_id[:8]})',
                lead=None,  # FK nulled — snapshot lives in extra
                extra=extra,
            ))

        return Response(
            {'detail': 'Lead permanently deleted.', 'deleted_id': lead_id},
            status=http_status.HTTP_200_OK,
        )

    # ── Block bare DELETE on the resource ────────────────────────────────
    def destroy(self, request, *args, **kwargs):
        # Should not be reachable because http_method_names excludes 'delete',
        # but kept as defence in depth in case http_method_names is overridden.
        return Response(
            {
                'detail': (
                    'DELETE method disabled. Use POST '
                    '/api/leads/{id}/archive/ for soft delete or POST '
                    '/api/leads/{id}/permanent-delete/ (admin) for hard delete.'
                )
            },
            status=http_status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class LeadStatusViewSet(viewsets.ModelViewSet):
    queryset           = LeadStatus.objects.all().order_by('order')
    serializer_class   = LeadStatusSerializer
    permission_classes = [permissions.IsAuthenticated]


class LeadPriorityViewSet(viewsets.ModelViewSet):
    queryset           = LeadPriority.objects.all().order_by('order')
    serializer_class   = LeadPrioritySerializer
    permission_classes = [permissions.IsAuthenticated]


class LeadStageViewSet(viewsets.ModelViewSet):
    serializer_class   = LeadStageSerializer
    permission_classes = [IsAuthenticated]
    queryset           = LeadStage.objects.filter(is_active=True).order_by('order')
    http_method_names  = ['get', 'post', 'patch', 'delete']
