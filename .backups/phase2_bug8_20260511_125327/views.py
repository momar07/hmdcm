from rest_framework             import viewsets, status, filters
from rest_framework.decorators  import action
from rest_framework.response    import Response
from rest_framework.permissions import IsAuthenticated
from django.utils               import timezone
from django_filters.rest_framework import DjangoFilterBackend
import threading, asyncio, logging

from .models       import ApprovalRequest, ApprovalStatus
from .serializers  import (
    ApprovalListSerializer,
    ApprovalCreateSerializer,
    ApprovalReviewSerializer,
)

logger = logging.getLogger(__name__)


def _push_ws(agent_id: str, payload: dict):
    """Push WebSocket notification to agent."""
    def _run():
        from channels.layers import get_channel_layer
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            cl = get_channel_layer()
            loop.run_until_complete(
                cl.group_send(
                    f"agent_{agent_id}",
                    {"type": "call_event", "payload": payload},
                )
            )
        finally:
            loop.close()
    threading.Thread(target=_run, daemon=True).start()


def _push_supervisors(payload: dict):
    """Push WebSocket notification to all supervisors."""
    def _run():
        from channels.layers import get_channel_layer
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            cl = get_channel_layer()
            loop.run_until_complete(
                cl.group_send(
                    "supervisors",
                    {"type": "call_event", "payload": payload},
                )
            )
        finally:
            loop.close()
    threading.Thread(target=_run, daemon=True).start()


class ApprovalViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields   = ["status", "approval_type", "requested_by"]
    ordering_fields    = ["created_at", "updated_at"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, "role", "agent")
        qs   = ApprovalRequest.objects.select_related(
            "requested_by", "reviewed_by", "ticket", "lead"
        )
        # Agents see only their own requests
        if role == "agent":
            return qs.filter(requested_by=user)
        # Supervisors & admins see all
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return ApprovalCreateSerializer
        return ApprovalListSerializer

    def create(self, request, *args, **kwargs):
        serializer = ApprovalCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        approval = serializer.save()

        # Notify supervisors via WS
        _push_supervisors({
            "type":              "approval_request",
            "approval_id":       str(approval.id),
            "approval_type":     approval.approval_type,
            "title":             approval.title,
            "amount":            str(approval.amount) if approval.amount else None,
            "requested_by_name": approval.requested_by.get_full_name(),
            "requested_by_id":   str(approval.requested_by.id),
            "lead_name":         approval.lead.get_full_name() if approval.lead else None,
            "ticket_number":     approval.ticket.ticket_number if approval.ticket else None,
        })

        # Persistent notification for each supervisor/admin
        try:
            from django.contrib.auth import get_user_model
            from apps.notifications.services import create_notification
            User = get_user_model()
            supervisors = User.objects.filter(role__in=["admin", "supervisor"], is_active=True)
            amount_str = f" — Amount: {approval.amount}" if approval.amount else ""
            for sup in supervisors:
                create_notification(
                    recipient = sup,
                    type      = "approval_needed",
                    title     = f"📋 New approval request: {approval.title}",
                    body      = f"From {approval.requested_by.get_full_name()}{amount_str}",
                    link      = f"/approvals",
                    priority  = "high",
                    data      = {
                        "approval_id":       str(approval.id),
                        "approval_type":     approval.approval_type,
                        "requested_by_id":   str(approval.requested_by.id),
                        "requested_by_name": approval.requested_by.get_full_name(),
                        "amount":            str(approval.amount) if approval.amount else None,
                    },
                )
        except Exception as e:
            logger.warning(f"Persistent approval notify failed: {e}")


        return Response(
            ApprovalListSerializer(approval).data,
            status=status.HTTP_201_CREATED,
        )

    # ── GET /api/approvals/pending/ ────────────────────────────
    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        qs = self.get_queryset().filter(status=ApprovalStatus.PENDING)
        serializer = ApprovalListSerializer(qs, many=True)
        return Response({"count": qs.count(), "results": serializer.data})

    # ── POST /api/approvals/{id}/approve/ ─────────────────────
    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        approval = self.get_object()
        user     = request.user
        role     = getattr(user, "role", "agent")

        if role not in ("supervisor", "admin"):
            return Response(
                {"detail": "Only supervisors can approve requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if approval.status != ApprovalStatus.PENDING:
            return Response(
                {"detail": f"Cannot approve — status is {approval.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = ApprovalReviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        approval.status         = ApprovalStatus.APPROVED
        approval.reviewed_by    = user
        approval.reviewed_at    = timezone.now()
        approval.review_comment = s.validated_data.get("review_comment", "")
        approval.save()

        # Update linked ticket if exists
        if approval.ticket:
            _update_ticket_event(approval, "approved")

        # Notify agent via WS
        _push_ws(str(approval.requested_by.id), {
            "type":           "approval_update",
            "approval_id":    str(approval.id),
            "approval_type":  approval.approval_type,
            "title":          approval.title,
            "status":         "approved",
            "review_comment": approval.review_comment,
            "reviewed_by":    user.get_full_name(),
        })

        # Persistent in-app notification for the agent
        try:
            from apps.notifications.services import create_notification
            decision = approval.status  # "approved" or "rejected"
            icon     = "✅" if decision == "approved" else "❌"
            create_notification(
                recipient = approval.requested_by,
                type      = "approval_update",
                title     = f"{icon} Approval {decision}: {approval.title}",
                body      = approval.review_comment or f"Your request has been {decision}.",
                link      = f"/approvals",
                priority  = "high",
                data      = {
                    "approval_id":    str(approval.id),
                    "approval_type": approval.approval_type,
                    "status":        decision,
                    "review_comment": approval.review_comment,
                    "reviewed_by":    user.get_full_name(),
                },
            )
        except Exception as e:
            logger.warning(f"Persistent agent approval notify failed: {e}")


        return Response(ApprovalListSerializer(approval).data)

    # ── POST /api/approvals/{id}/reject/ ──────────────────────
    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, pk=None):
        approval = self.get_object()
        user     = request.user
        role     = getattr(user, "role", "agent")

        if role not in ("supervisor", "admin"):
            return Response(
                {"detail": "Only supervisors can reject requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if approval.status != ApprovalStatus.PENDING:
            return Response(
                {"detail": f"Cannot reject — status is {approval.status}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = ApprovalReviewSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        approval.status         = ApprovalStatus.REJECTED
        approval.reviewed_by    = user
        approval.reviewed_at    = timezone.now()
        approval.review_comment = s.validated_data.get("review_comment", "")
        approval.save()

        if approval.ticket:
            _update_ticket_event(approval, "rejected")

        _push_ws(str(approval.requested_by.id), {
            "type":           "approval_update",
            "approval_id":    str(approval.id),
            "approval_type":  approval.approval_type,
            "title":          approval.title,
            "status":         "rejected",
            "review_comment": approval.review_comment,
            "reviewed_by":    user.get_full_name(),
        })

        # Persistent in-app notification for the agent
        try:
            from apps.notifications.services import create_notification
            decision = approval.status  # "approved" or "rejected"
            icon     = "✅" if decision == "approved" else "❌"
            create_notification(
                recipient = approval.requested_by,
                type      = "approval_update",
                title     = f"{icon} Approval {decision}: {approval.title}",
                body      = approval.review_comment or f"Your request has been {decision}.",
                link      = f"/approvals",
                priority  = "high",
                data      = {
                    "approval_id":    str(approval.id),
                    "approval_type": approval.approval_type,
                    "status":        decision,
                    "review_comment": approval.review_comment,
                    "reviewed_by":    user.get_full_name(),
                },
            )
        except Exception as e:
            logger.warning(f"Persistent agent approval notify failed: {e}")


        return Response(ApprovalListSerializer(approval).data)

    # ── POST /api/approvals/{id}/cancel/ ──────────────────────
    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        approval = self.get_object()
        if approval.requested_by != request.user:
            return Response(
                {"detail": "You can only cancel your own requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if approval.status != ApprovalStatus.PENDING:
            return Response(
                {"detail": "Only pending requests can be cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        approval.status = ApprovalStatus.CANCELLED
        approval.save()
        return Response(ApprovalListSerializer(approval).data)


def _update_ticket_event(approval: ApprovalRequest, decision: str):
    """Add approval event to ticket history."""
    try:
        from apps.tickets.models import TicketHistory
        TicketHistory.objects.create(
            ticket    = approval.ticket,
            actor     = approval.reviewed_by,
            field     = "approval",
            old_value = "pending",
            new_value = decision,
            note      = f"Approval [{approval.approval_type}]: {approval.review_comment}",
        )
    except Exception as e:
        logger.warning(f"[Approval] Could not update ticket history: {e}")
