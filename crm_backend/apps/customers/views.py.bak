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
        # Build all phone variants for matching
        from apps.customers.models import CustomerPhone
        phone_rows = CustomerPhone.objects.filter(customer_id=pk).values_list('number', 'normalized')
        phone_variants = set()
        for number, normalized in phone_rows:
            for val in [number, normalized]:
                if not val: continue
                phone_variants.add(val)
                digits = ''.join(c for c in val if c.isdigit())
                if digits:
                    phone_variants.add(digits)
                    if not val.startswith('+'): phone_variants.add('+' + digits)
                    if len(digits) >= 9: phone_variants.add(digits[-9:])

        # Match by customer FK OR by caller/callee phone number
        from django.db.models import Q
        calls_qs = Call.objects.filter(
            Q(customer_id=pk) |
            Q(caller__in=phone_variants) |
            Q(callee__in=phone_variants)
        ).select_related('agent', 'completion__disposition').order_by('-started_at')[:50]

        # Auto-link unlinked calls to this customer
        from apps.customers.models import Customer as CustomerModel
        try:
            customer_obj = CustomerModel.objects.get(id=pk)
            Call.objects.filter(
                Q(caller__in=phone_variants, customer__isnull=True) |
                Q(callee__in=phone_variants, customer__isnull=True)
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

            # Resolve followup linked to this call
            followup_id    = None
            followup_title = None
            try:
                fu = call.followups.filter(status='pending').first() or call.followups.first()
                if fu:
                    followup_id    = str(fu.id)
                    followup_title = fu.title
            except Exception:
                pass

            timeline.append({
                'type':           'call',
                'id':             str(call.id),
                'date':           call.started_at,
                'direction':      call.direction,
                'status':         call.status,
                'caller':         call.caller,
                'callee':         call.callee,
                'duration':       call.duration,
                'queue':          call.queue or '',
                'agent_name':     call.agent.get_full_name() if call.agent else None,
                'disposition':    disposition,
                'note':           note_text,
                'followup_id':    followup_id,
                'followup_title': followup_title,
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

        # ── Tickets ───────────────────────────────────────────────────
        from apps.tickets.models import Ticket
        tickets_qs = Ticket.objects.filter(
            customer_id=pk
        ).prefetch_related('tags').order_by('-created_at')[:20]
        for ticket in tickets_qs:
            timeline.append({
                'type':          'ticket',
                'id':            str(ticket.id),
                'date':          ticket.created_at,
                'ticket_number': ticket.ticket_number,
                'title':         ticket.title,
                'status':        ticket.status,
                'priority':      ticket.priority,
                'category':      ticket.category or None,
                'sla_breached':  ticket.sla_breached,
            })

        # ── Approvals ──────────────────────────────────────────────────
        from apps.approvals.models import ApprovalRequest
        approvals_qs = ApprovalRequest.objects.filter(
            customer_id=pk
        ).select_related('requested_by', 'reviewed_by').order_by('-created_at')[:20]
        for ap in approvals_qs:
            timeline.append({
                'type':              'approval',
                'id':                str(ap.id),
                'date':              ap.created_at,
                'approval_type':     ap.approval_type,
                'status':            ap.status,
                'title':             ap.title,
                'description':       ap.description,
                'amount':            str(ap.amount) if ap.amount else None,
                'requested_by_name': ap.requested_by.get_full_name() if ap.requested_by else None,
                'reviewed_by_name':  ap.reviewed_by.get_full_name()  if ap.reviewed_by  else None,
                'review_comment':    ap.review_comment,
                'reviewed_at':       ap.reviewed_at,
                'ticket':            str(ap.ticket_id) if ap.ticket_id else None,
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



class CustomerBulkActionView(APIView):
    """
    POST /api/customers/bulk-action/
    body: {
        ids:        [uuid, ...],
        action:     'assign' | 'activate' | 'deactivate' | 'export',
        assigned_to: uuid   (required for action=assign)
    }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ids     = request.data.get('ids', [])
        action  = request.data.get('action', '').strip()

        if not ids or not action:
            return Response(
                {'error': 'ids and action are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(ids) > 500:
            return Response(
                {'error': 'Maximum 500 records per bulk action'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = Customer.objects.filter(id__in=ids)
        count = qs.count()

        if count == 0:
            return Response({'error': 'No matching customers found'}, status=404)

        if action == 'activate':
            qs.update(is_active=True)
            return Response({'updated': count, 'action': 'activated'})

        elif action == 'deactivate':
            qs.update(is_active=False)
            return Response({'updated': count, 'action': 'deactivated'})

        elif action == 'assign':
            assigned_to_id = request.data.get('assigned_to')
            if not assigned_to_id:
                return Response(
                    {'error': 'assigned_to is required for assign action'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from apps.users.models import User
            try:
                agent = User.objects.get(pk=assigned_to_id)
            except User.DoesNotExist:
                return Response({'error': 'Agent not found'}, status=404)
            qs.update(assigned_to=agent)
            return Response({
                'updated':      count,
                'action':       'assigned',
                'assigned_to':  agent.get_full_name(),
            })

        elif action == 'export':
            # Return CSV-ready data
            customers = qs.prefetch_related('phones', 'tags').order_by('first_name')
            rows = []
            for c in customers:
                primary = c.phones.filter(is_primary=True).first() or c.phones.first()
                rows.append({
                    'id':         str(c.id),
                    'first_name': c.first_name,
                    'last_name':  c.last_name,
                    'email':      c.email or '',
                    'company':    c.company or '',
                    'phone':      primary.number if primary else '',
                    'city':       c.city or '',
                    'country':    c.country or '',
                    'is_active':  c.is_active,
                    'created_at': c.created_at.strftime('%Y-%m-%d') if c.created_at else '',
                    'tags':       ', '.join(t.name for t in c.tags.all()),
                })
            return Response({'count': len(rows), 'data': rows})

        else:
            return Response(
                {'error': f'Unknown action: {action}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
