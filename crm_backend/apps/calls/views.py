from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError

from .models import Call, Disposition
from .serializers import (CallListSerializer, CallDetailSerializer,
                           OriginateCallSerializer, DispositionSerializer,
                           CallDispositionSerializer)
from .selectors import get_all_calls
from .services import complete_call, get_pending_completions
from apps.common.permissions import IsAgent
from apps.leads.models import LeadStage


class CallViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['direction', 'status', 'agent', 'queue', 'customer']
    http_method_names  = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        return get_all_calls(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CallDetailSerializer
        if self.action == 'originate':
            return OriginateCallSerializer
        return CallListSerializer

    @action(detail=True, methods=['post'], url_path='disposition')
    def add_disposition(self, request, pk=None):
        call = self.get_object()
        serializer = CallDispositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        disposition = Disposition.objects.get(pk=serializer.validated_data['disposition_id'])
        from .models import CallDisposition
        cd = CallDisposition.objects.create(
            call        = call,
            disposition = disposition,
            note        = serializer.validated_data.get('note', ''),
            agent       = request.user,
        )
        return Response({'id': str(cd.id), 'message': 'Disposition added.'})

    @action(detail=False, methods=['get'], url_path='dispositions')
    def dispositions(self, request):
        qs = Disposition.objects.filter(is_active=True).order_by('order')
        return Response(DispositionSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='originate')
    def originate(self, request, pk=None):
        """
        POST /api/calls/originate/
        body: { phone_number, customer_id?, lead_id? }
        Triggers an AMI Originate — agent extension rings first,
        then Asterisk dials the destination.
        """
        from django.conf import settings
        phone  = request.data.get('phone_number', '').strip()
        if not phone:
            return Response({'error': 'phone_number is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Get agent extension
        try:
            from apps.users.models import Extension
            ext_obj = Extension.objects.get(user=request.user, is_active=True)
            agent_ext = ext_obj.number
        except Exception:
            return Response({'error': 'No active extension for this agent'}, status=status.HTTP_400_BAD_REQUEST)

        # AMI Originate
        try:
            import socket, time
            ami_host   = getattr(settings, 'AMI_HOST',   '192.168.2.222')
            ami_port   = int(getattr(settings, 'AMI_PORT',   5038))
            ami_user   = getattr(settings, 'AMI_USERNAME', 'admin')
            ami_secret = getattr(settings, 'AMI_SECRET',   'admin')

            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(10)
            s.connect((ami_host, ami_port))
            s.recv(1024)  # banner

            # Login
            s.sendall(
                f'Action: Login\r\nUsername: {ami_user}\r\nSecret: {ami_secret}\r\n\r\n'
                .encode()
            )
            time.sleep(0.3)
            s.recv(1024)

            # Originate — agent ext rings first, then dials phone
            action_id = f'crm-{request.user.id}-{int(time.time())}'
            cmd = (
                f'Action: Originate\r\n'
                f'ActionID: {action_id}\r\n'
                f'Channel: PJSIP/{agent_ext}\r\n'
                f'Exten: {phone}\r\n'
                f'Context: from-internal\r\n'
                f'Priority: 1\r\n'
                f'CallerID: CRM <{agent_ext}>\r\n'
                f'Timeout: 30000\r\n'
                f'Async: true\r\n'
                f'\r\n'
            )
            s.sendall(cmd.encode())
            time.sleep(0.5)
            resp = s.recv(2048).decode(errors='ignore')
            s.close()

            if 'Success' in resp or 'Queued' in resp:
                return Response({'message': f'Dialing {phone} from ext {agent_ext}', 'action_id': action_id})
            else:
                return Response({'error': f'AMI response: {resp[:200]}'}, status=status.HTTP_502_BAD_GATEWAY)

        except Exception as e:
            return Response({'error': f'AMI connection failed: {str(e)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ── Screen Pop View ─────────────────────────────────────────────────────

class ScreenPopView(APIView):
    """
    GET /api/calls/screen-pop/?phone=+201001234567
    Returns customer + open leads matching the caller number.
    Used by the frontend IncomingCallPopup to show caller info.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        phone = request.query_params.get('phone', '').strip()
        if not phone:
            return Response(
                {'detail': 'phone parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # normalise — keep last 9 digits for fuzzy match
        digits = ''.join(c for c in phone if c.isdigit())
        suffix = digits[-9:] if len(digits) >= 9 else digits

        from apps.customers.models import CustomerPhone
        from apps.leads.models import Lead

        phone_obj = CustomerPhone.objects.select_related('customer').filter(
            normalized__endswith=suffix
        ).first()

        if not phone_obj:
            return Response({'found': False, 'customer': None, 'leads': []})

        customer = phone_obj.customer
        leads = Lead.objects.filter(
            customer=customer, is_active=True
        ).select_related('stage', 'status', 'assigned_to').order_by('-created_at')[:5]

        return Response({
            'found': True,
            'customer': {
                'id':        str(customer.id),
                'name':      customer.get_full_name(),
                'phone':     phone_obj.number,
                'email':     customer.email,
            },
            'leads': [{
                'id':           str(l.id),
                'title':        l.title,
                'stage_name':   l.stage.name  if l.stage  else None,
                'stage_color':  l.stage.color if l.stage  else None,
                'status_name':  l.status.name if l.status else None,
                'assigned_to':  l.assigned_to.get_full_name() if l.assigned_to else None,
                'value':        str(l.value)  if l.value  else None,
            } for l in leads],
        })


# ── Call Completion (Enforcement) Views ──────────────────────────────────

class CallCompleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, call_id):
        try:
            completion = complete_call(
                call_id = str(call_id),
                agent   = request.user,
                data    = request.data,
            )
            return Response({
                'id':               str(completion.id),
                'call_id':          str(completion.call_id),
                'disposition':      completion.disposition.name,
                'next_action':      completion.next_action,
                'followup_created': bool(completion.followup_created_id),
                'message':          'Call completed successfully.',
            }, status=status.HTTP_201_CREATED)
        except ValidationError as e:
            msg = e.message if hasattr(e, 'message') else str(e)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PendingCompletionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        calls = get_pending_completions(agent=request.user)
        return Response([{
            'id':            str(c.id),
            'caller':        c.caller,
            'customer':      str(c.customer_id) if c.customer_id else None,
            'customer_name': c.customer.get_full_name() if c.customer else None,
            'started_at':    c.started_at,
            'duration':      c.duration,
        } for c in calls])


class DispositionsListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        dispositions = Disposition.objects.filter(is_active=True).order_by('order')
        return Response([{
            'id':                  str(d.id),
            'name':                d.name,
            'code':                d.code,
            'color':               d.color,
            'requires_followup':   d.requires_followup,
            'default_next_action': d.default_next_action,
        } for d in dispositions])


class LeadStagesListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        stages = LeadStage.objects.filter(is_active=True).order_by('order')
        return Response([{
            'id':        str(s.id),
            'name':      s.name,
            'slug':      s.slug,
            'color':     s.color,
            'is_won':    s.is_won,
            'is_closed': s.is_closed,
        } for s in stages])


class LinkCallToCustomerView(APIView):
    """POST /api/calls/link-call/ — attach an open call to a newly-created customer"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        uniqueid    = request.data.get('uniqueid')
        customer_id = request.data.get('customer_id')

        if not uniqueid or not customer_id:
            return Response(
                {'error': 'uniqueid and customer_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from apps.customers.models import Customer
            customer = Customer.objects.get(id=customer_id)
        except Exception:
            return Response({'error': 'Customer not found'}, status=status.HTTP_404_NOT_FOUND)

        updated = Call.objects.filter(uniqueid=uniqueid).update(customer=customer)

        if updated == 0:
            # Try matching by caller phone number as fallback
            from apps.customers.models import CustomerPhone
            phones = CustomerPhone.objects.filter(customer=customer).values_list('number', flat=True)
            updated = Call.objects.filter(
                caller__in=list(phones),
                customer__isnull=True
            ).order_by('-started_at').update(customer=customer)

        return Response({
            'linked': updated,
            'customer_id': str(customer_id),
            'uniqueid': uniqueid,
        }, status=status.HTTP_200_OK)
