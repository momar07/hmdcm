from rest_framework                  import viewsets, status, filters
from rest_framework.decorators       import action
from rest_framework.response         import Response
from rest_framework.views            import APIView
from rest_framework.permissions      import IsAuthenticated
from rest_framework.parsers          import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework   import DjangoFilterBackend
from django.utils                    import timezone
from django.db.models                import Q
import os, uuid

from .models       import Ticket, TicketNote, TicketAttachment, Tag, SLAPolicy
from .serializers  import (
    TicketListSerializer, TicketDetailSerializer,
    TicketCreateSerializer, TicketUpdateSerializer,
    TicketNoteSerializer, TicketAttachmentSerializer,
    TagSerializer, SLAPolicySerializer,
)
from .filters      import TicketFilter
from .queries      import (
    get_dashboard_stats, get_agent_workload,
    get_tickets_by_phone, get_tickets_by_call_id,
)


# ═══════════════════════════════════════════════════════════════════
# TICKET VIEWSET
# ═══════════════════════════════════════════════════════════════════

class TicketViewSet(viewsets.ModelViewSet):
    permission_classes  = [IsAuthenticated]
    filter_backends     = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class     = TicketFilter
    ordering_fields     = ["created_at", "updated_at", "priority", "status", "ticket_number"]
    ordering            = ["-updated_at"]

    def get_queryset(self):
        user = self.request.user
        qs   = (
            Ticket.objects
            .select_related("customer", "agent", "created_by", "sla_policy", "call")
            .prefetch_related("tags")
        )
        # Agents only see their own tickets
        # Supervisors / admins see all
        role = getattr(user, "role", "agent")
        if role == "agent":
            qs = qs.filter(
                Q(agent=user) | Q(created_by=user)
            )
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return TicketListSerializer
        if self.action == "create":
            return TicketCreateSerializer
        if self.action in ("update", "partial_update"):
            return TicketUpdateSerializer
        return TicketDetailSerializer

    # ── Extra actions ─────────────────────────────────────────────

    @action(detail=True, methods=["post"], url_path="notes")
    def add_note(self, request, pk=None):
        """POST /api/tickets/<id>/notes/"""
        ticket = self.get_object()
        serializer = TicketNoteSerializer(
            data=request.data,
            context={"request": request},
        )
        if serializer.is_valid():
            serializer.save(ticket=ticket)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=["get"], url_path="notes")
    def list_notes(self, request, pk=None):
        """GET /api/tickets/<id>/notes/"""
        ticket = self.get_object()
        user   = request.user
        role   = getattr(user, "role", "agent")

        notes = ticket.notes.select_related("author", "edited_by")
        # Non-agents cannot see internal notes
        if role not in ("admin", "supervisor", "agent"):
            notes = notes.filter(visibility="public")

        serializer = TicketNoteSerializer(notes, many=True)
        return Response(serializer.data)

    @action(
        detail=True, methods=["post"], url_path="attachments",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def add_attachment(self, request, pk=None):
        """POST /api/tickets/<id>/attachments/"""
        ticket = self.get_object()
        file   = request.FILES.get("file")

        if not file:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save file to media/tickets/
        upload_dir = f"media/tickets/{ticket.id}"
        os.makedirs(upload_dir, exist_ok=True)
        ext       = os.path.splitext(file.name)[1]
        file_name = f"{uuid.uuid4()}{ext}"
        file_path = f"{upload_dir}/{file_name}"

        with open(file_path, "wb+") as dest:
            for chunk in file.chunks():
                dest.write(chunk)

        attachment = TicketAttachment.objects.create(
            ticket          = ticket,
            uploaded_by     = request.user,
            file_name       = file.name,
            file_path       = file_path,
            file_size       = file.size,
            mime_type       = file.content_type or "",
            attachment_type = request.data.get("attachment_type", "file"),
            asterisk_call_id = request.data.get("asterisk_call_id", ""),
        )
        return Response(
            TicketAttachmentSerializer(attachment).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="escalate")
    def escalate(self, request, pk=None):
        """POST /api/tickets/<id>/escalate/"""
        ticket = self.get_object()
        ticket.is_escalated    = True
        ticket.escalated_at    = timezone.now()
        ticket.escalation_note = request.data.get("note", "")
        escalated_to_id        = request.data.get("escalated_to")
        if escalated_to_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                ticket.escalated_to = User.objects.get(pk=escalated_to_id)
            except User.DoesNotExist:
                pass
        ticket.save()
        return Response(
            TicketDetailSerializer(ticket, context={"request": request}).data
        )

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        """POST /api/tickets/<id>/resolve/"""
        ticket             = self.get_object()
        ticket.status      = "resolved"
        ticket.resolved_at = timezone.now()
        ticket.save()
        return Response({"status": "resolved", "resolved_at": ticket.resolved_at})

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        """POST /api/tickets/<id>/close/"""
        ticket           = self.get_object()
        ticket.status    = "closed"
        ticket.closed_at = timezone.now()
        ticket.save()
        return Response({"status": "closed", "closed_at": ticket.closed_at})

    @action(detail=True, methods=["get"], url_path="history")
    def ticket_history(self, request, pk=None):
        """GET /api/tickets/<id>/history/"""
        ticket  = self.get_object()
        history = ticket.history.select_related("actor").order_by("-created_at")
        from .serializers import TicketHistorySerializer
        return Response(TicketHistorySerializer(history, many=True).data)


# ═══════════════════════════════════════════════════════════════════
# TICKET DASHBOARD STATS
# ═══════════════════════════════════════════════════════════════════

class TicketDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, "role", "agent")

        # Agents see their own stats; supervisors/admins see all
        agent_id = str(user.id) if role == "agent" else None

        stats    = get_dashboard_stats(agent_id=agent_id)
        workload = get_agent_workload() if role in ("admin", "supervisor") else []

        return Response({
            "stats":    stats,
            "workload": workload,
        })


# ═══════════════════════════════════════════════════════════════════
# SCREEN POP — find tickets by phone or call_id during incoming call
# ═══════════════════════════════════════════════════════════════════

class TicketScreenPopView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        phone   = request.query_params.get("phone", "")
        call_id = request.query_params.get("call_id", "")

        tickets = []
        if call_id:
            tickets = get_tickets_by_call_id(call_id)
        elif phone:
            tickets = get_tickets_by_phone(phone)

        return Response(
            TicketListSerializer(tickets, many=True).data
        )


# ═══════════════════════════════════════════════════════════════════
# TAG VIEWSET
# ═══════════════════════════════════════════════════════════════════

class TagViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset           = Tag.objects.all().order_by("name")
    serializer_class   = TagSerializer
    filter_backends    = [filters.SearchFilter]
    search_fields      = ["name"]


# ═══════════════════════════════════════════════════════════════════
# SLA POLICY VIEWSET
# ═══════════════════════════════════════════════════════════════════

class SLAPolicyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset           = SLAPolicy.objects.filter(is_active=True).order_by("priority")
    serializer_class   = SLAPolicySerializer
