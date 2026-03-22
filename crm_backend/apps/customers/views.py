from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import Customer, CustomerTag
from .serializers import (
    CustomerListSerializer,
    CustomerDetailSerializer,
    CustomerTagSerializer,
    CustomerPhoneSerializer,
)
from .selectors import get_all_customers, search_customers
from .services import create_customer, add_phone_to_customer


class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['is_active', 'assigned_to', 'country', 'source']
    search_fields      = ['first_name', 'last_name', 'email', 'company', 'phones__number']
    ordering_fields    = ['first_name', 'created_at']

    def get_queryset(self):
        return get_all_customers(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return CustomerListSerializer
        return CustomerDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = CustomerDetailSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        # phones come as raw list — not part of validated_data (read_only)
        phones_data = request.data.get('phones', [])

        data = dict(serializer.validated_data)
        data['phones'] = phones_data

        # auto-assign to current user if not provided
        if not data.get('assigned_to'):
            data['assigned_to'] = request.user

        customer = create_customer(data)
        out = CustomerDetailSerializer(customer, context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop('partial', False)
        instance   = self.get_object()
        serializer = CustomerDetailSerializer(
            instance,
            data=request.data,
            partial=partial,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # ── extra actions ────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='phones')
    def add_phone(self, request, pk=None):
        """Add a phone number to an existing customer."""
        serializer = CustomerPhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = add_phone_to_customer(pk, **serializer.validated_data)
        return Response(
            CustomerPhoneSerializer(phone).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        """Full-text customer search."""
        q          = request.query_params.get('q', '')
        customers  = search_customers(q)
        serializer = CustomerListSerializer(customers, many=True)
        return Response(serializer.data)


class CustomerTagViewSet(viewsets.ModelViewSet):
    queryset           = CustomerTag.objects.all()
    serializer_class   = CustomerTagSerializer
    permission_classes = [permissions.IsAuthenticated]


class CustomerHistoryView(APIView):
    """
    GET /api/customers/<id>/history/
    Returns a unified timeline: calls (with dispositions) + notes + leads
    sorted by date descending.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        from apps.calls.models import Call, CallCompletion
        from apps.notes.models import Note
        from apps.leads.models import Lead
        from django.utils.timezone import is_aware
        import datetime

        timeline = []

        # ── Calls ────────────────────────────────────────────────────
        # Get customer's phone numbers for fallback matching
        from apps.customers.models import CustomerPhone
        customer_phones = list(
            CustomerPhone.objects.filter(customer_id=pk).values_list('number', flat=True)
        )

        # Match by customer FK OR by caller phone number (handles unlinked calls)
        from django.db.models import Q
        calls_qs = Call.objects.filter(
            Q(customer_id=pk) |
            Q(caller__in=customer_phones, customer__isnull=True)
        ).select_related('agent', 'completion__disposition').order_by('-started_at')[:50]

        # Auto-link unlinked calls to this customer
        from apps.customers.models import Customer as CustomerModel
        try:
            customer_obj = CustomerModel.objects.get(id=pk)
            Call.objects.filter(
                caller__in=customer_phones, customer__isnull=True
            ).update(customer=customer_obj)
        except Exception:
            pass

        calls = calls_qs

        for call in calls:
            disposition = None
            note_text   = None
            try:
                disposition = call.completion.disposition.name
                note_text   = call.completion.note
            except Exception:
                pass

            timeline.append({
                'type':        'call',
                'id':          str(call.id),
                'date':        call.started_at,
                'direction':   call.direction,
                'status':      call.status,
                'caller':      call.caller,
                'callee':      call.callee,
                'duration':    call.duration,
                'queue':       call.queue or '',
                'agent_name':  call.agent.get_full_name() if call.agent else None,
                'disposition': disposition,
                'note':        note_text,
            })

        # ── Notes ─────────────────────────────────────────────────────
        notes = Note.objects.filter(customer_id=pk).select_related('author').order_by('-created_at')[:50]
        for note in notes:
            timeline.append({
                'type':       'note',
                'id':         str(note.id),
                'date':       note.created_at,
                'content':    note.content,
                'author':     note.author.get_full_name() if note.author else None,
                'is_pinned':  note.is_pinned,
                'call_id':    str(note.call_id) if note.call_id else None,
                'lead_id':    str(note.lead_id) if note.lead_id else None,
            })

        # ── Leads ─────────────────────────────────────────────────────
        leads = Lead.objects.filter(customer_id=pk).select_related(
            'status', 'stage', 'assigned_to'
        ).order_by('-created_at')[:20]
        for lead in leads:
            timeline.append({
                'type':         'lead',
                'id':           str(lead.id),
                'date':         lead.created_at,
                'title':        lead.title,
                'status_name':  lead.status.name if lead.status else None,
                'stage_name':   lead.stage.name  if lead.stage  else None,
                'stage_color':  lead.stage.color if lead.stage  else None,
                'assigned_to':  lead.assigned_to.get_full_name() if lead.assigned_to else None,
                'value':        str(lead.value) if lead.value else None,
                'source':       lead.source,
            })

        # ── Sort all by date descending ────────────────────────────────
        def sort_key(item):
            d = item.get('date')
            if d is None:
                return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
            if hasattr(d, 'tzinfo') and d.tzinfo is None:
                return d.replace(tzinfo=datetime.timezone.utc)
            return d

        timeline.sort(key=sort_key, reverse=True)

        return Response({
            'count':   len(timeline),
            'results': timeline,
        })

