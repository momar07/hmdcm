from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
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
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ['direction', 'status', 'agent', 'queue', 'customer']
    search_fields      = ['caller', 'callee', 'uniqueid',
                          'customer__first_name', 'customer__last_name',
                          'agent__first_name', 'agent__last_name',
                          'queue']
    ordering_fields    = ['started_at', 'created_at', 'duration']
    http_method_names  = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = get_all_calls(user=self.request.user)
        # When filtering by customer, show ALL calls for that customer
        # regardless of agent assignment (for customer detail page)
        customer_id = self.request.query_params.get('customer')
        if customer_id:
            from django.db.models import Q as _Q
            from apps.customers.models import CustomerPhone as _CP
            # Build all phone variants (raw, normalized, +prefix, 9-digit suffix)
            phone_rows = _CP.objects.filter(customer_id=customer_id).values_list('number', 'normalized')
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

            qs = Call.objects.select_related(
                'agent', 'customer'
            ).prefetch_related('events').filter(
                _Q(customer_id=customer_id) |
                _Q(caller__in=phone_variants) |
                _Q(callee__in=phone_variants)
            ).distinct().order_by('-created_at')
        return qs

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
            'direction':     c.direction,
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
            'direction':           d.direction,
            'actions':             list(d.actions.order_by('order').values(
                                       'id', 'action_type', 'config', 'order'
                                   )),
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


# ── WebRTC Call Tracking ──────────────────────────────────────────────────

class StartWebrtcCallView(APIView):
    """
    POST /api/calls/start-webrtc-call/
    Called by the frontend the moment the agent fires a WebRTC/JsSIP outbound call.
    Creates the Call record immediately so it appears in the timeline and calls page.
    body: { customer_phone, customer_id?, lead_id?, followup_id? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.utils import timezone as tz
        from apps.customers.models import Customer, CustomerPhone

        phone       = (request.data.get('customer_phone') or '').strip()
        customer_id = request.data.get('customer_id')
        lead_id     = request.data.get('lead_id')

        if not phone:
            return Response({'error': 'customer_phone is required'}, status=400)

        # Resolve agent extension
        caller = ''
        try:
            from apps.users.models import Extension
            ext = Extension.objects.get(user=request.user, is_active=True)
            caller = ext.number
        except Exception:
            caller = str(request.user.id)[:8]

        # Resolve customer
        customer = None
        if customer_id:
            try:
                customer = Customer.objects.get(pk=customer_id)
            except Customer.DoesNotExist:
                pass

        if not customer:
            digits = ''.join(c for c in phone if c.isdigit())
            suffix = digits[-9:] if len(digits) >= 9 else digits
            phone_obj = CustomerPhone.objects.select_related('customer').filter(
                normalized__endswith=suffix
            ).first()
            if phone_obj:
                customer = phone_obj.customer

        # Resolve lead
        lead = None
        if lead_id:
            try:
                from apps.leads.models import Lead
                lead = Lead.objects.get(pk=lead_id)
            except Exception:
                pass

        from .models import Call
        import uuid as _uuid
        call = Call.objects.create(
            uniqueid   = f'webrtc-{_uuid.uuid4().hex[:12]}',
            caller     = caller,
            callee     = phone,
            direction  = 'outbound',
            status     = 'ringing',
            customer   = customer,
            agent      = request.user,
            lead       = lead,
            started_at = tz.now(),
        )

        return Response({
            'call_id':     str(call.id),
            'caller':      caller,
            'callee':      phone,
            'customer_id': str(customer.id) if customer else None,
            'message':     'Call record created.',
        }, status=201)


class EndWebrtcCallView(APIView):
    """
    PATCH /api/calls/{call_id}/end-webrtc-call/
    Called by the frontend when the WebRTC call ends (idle).
    Updates status and duration.
    body: { end_cause: 'ended'|'busy'|'no_answer'|'failed'|'cancel', duration? }
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, call_id):
        from django.utils import timezone as tz
        from .models import Call

        try:
            call = Call.objects.get(pk=call_id, agent=request.user)
        except Call.DoesNotExist:
            return Response({'error': 'Call not found'}, status=404)

        end_cause = (request.data.get('end_cause') or 'ended').lower()
        duration  = int(request.data.get('duration') or 0)

        # If call was already marked answered by AMI/AgentConnect — keep it
        if call.status == 'answered':
            final_status = 'answered'
        # Map JsSIP end cause → Call status
        elif 'busy' in end_cause:
            final_status = 'busy'
        elif 'no_answer' in end_cause or 'no answer' in end_cause or 'unavailable' in end_cause:
            final_status = 'no_answer'
        elif 'cancel' in end_cause or 'reject' in end_cause or 'forbidden' in end_cause:
            final_status = 'no_answer'
        elif 'failed' in end_cause or 'error' in end_cause:
            final_status = 'failed'
        else:
            # 'ended' or 'Normal Clearing' = the call was actually answered
            final_status = 'answered'

        # Calculate duration from started_at if not provided
        if duration == 0 and call.started_at and final_status == 'answered':
            delta    = (tz.now() - call.started_at).total_seconds()
            duration = max(0, int(delta))

        call.status   = final_status
        call.ended_at = tz.now()
        call.duration = duration
        call.save(update_fields=['status', 'ended_at', 'duration'])

        return Response({
            'call_id': str(call.id),
            'status':  final_status,
            'duration': duration,
            'message': 'Call record updated.',
        })


# ── Disposition CRUD (Settings) ──────────────────────────────────────────────

class DispositionViewSet(viewsets.ModelViewSet):
    """
    CRUD للـ Dispositions — مع filter على الـ direction.
    GET /api/calls/dispositions-crud/?direction=inbound
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend]
    filterset_fields   = ['direction', 'is_active']

    def get_queryset(self):
        return Disposition.objects.prefetch_related('actions').order_by('order', 'name')

    def get_serializer_class(self):
        from .serializers import DispositionFullSerializer
        return DispositionFullSerializer

    def destroy(self, request, *args, **kwargs):
        """Soft delete — لو في completions مرتبطة، اعمله inactive بدل ما تمسحه"""
        instance = self.get_object()
        try:
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception:
            # في completions مرتبطة — soft delete
            instance.is_active = False
            instance.save(update_fields=['is_active'])
            return Response(
                {'detail': 'Disposition deactivated (has linked call records).'},
                status=status.HTTP_200_OK
            )


class DispositionActionViewSet(viewsets.ModelViewSet):
    """
    CRUD للـ actions الخاصة بكل disposition.
    POST /api/calls/disposition-actions/  body: { disposition, action_type, config, order }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        from .models import DispositionAction
        qs = DispositionAction.objects.select_related('disposition')
        disp_id = self.request.query_params.get('disposition')
        if disp_id:
            qs = qs.filter(disposition_id=disp_id)
        return qs.order_by('order')

    def get_serializer_class(self):
        from .serializers import DispositionActionSerializer
        return DispositionActionSerializer

    def perform_create(self, serializer):
        from .models import DispositionAction
        serializer.save()


class MarkCallAnsweredView(APIView):
    """PATCH /api/calls/{call_id}/mark-answered/ — marks inbound SIP call as answered"""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, call_id):
        from django.utils import timezone as tz
        from .models import Call
        try:
            call = Call.objects.get(pk=call_id)
        except Call.DoesNotExist:
            return Response({'error': 'Call not found'}, status=404)
        if call.status in ('ringing', 'incoming'):
            call.status     = 'answered'
            call.agent      = request.user
            call.started_at = tz.now()
            call.save(update_fields=['status', 'agent', 'started_at'])
        return Response({'call_id': str(call.id), 'status': call.status})


class RejectCallView(APIView):
    """PATCH /api/calls/{call_id}/reject/ — marks inbound call as no_answer when agent rejects"""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, call_id):
        from django.utils import timezone as tz
        from .models import Call
        try:
            call = Call.objects.get(pk=call_id)
        except Call.DoesNotExist:
            return Response({'error': 'Call not found'}, status=404)
        if call.status in ('ringing', 'incoming'):
            call.status   = 'no_answer'
            call.ended_at = tz.now()
            call.save(update_fields=['status', 'ended_at'])
        return Response({'call_id': str(call.id), 'status': call.status})


class AnswerQueuedCallView(APIView):
    """
    POST /api/calls/answer-queued/
    Bridges a queued call to the agent's SIP extension via AMI Redirect.
    This is the primary mechanism for answering inbound queue calls.
    Body: { call_id, queue (optional) }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import socket, time
        from django.conf import settings
        from django.utils import timezone as tz
        from .models import Call

        call_id = request.data.get('call_id')
        if not call_id:
            return Response({'error': 'call_id is required'}, status=400)

        try:
            call = Call.objects.select_related('agent').get(pk=call_id)
        except Call.DoesNotExist:
            return Response({'error': 'Call not found'}, status=404)

        # Get agent extension
        try:
            from apps.users.models import Extension
            ext_obj = Extension.objects.get(user=request.user, is_active=True)
            agent_ext = ext_obj.number
            agent_channel = f'PJSIP/{agent_ext}'
        except Exception:
            return Response({'error': 'No active extension for this agent'}, status=400)

        # AMI Redirect — move the call from queue to agent's extension
        ami_host   = getattr(settings, 'AMI_HOST', '192.168.2.222')
        ami_port   = int(getattr(settings, 'AMI_PORT', 5038))
        ami_user   = getattr(settings, 'AMI_USERNAME', 'admin')
        ami_secret = getattr(settings, 'AMI_SECRET', 'admin')

        try:
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
            resp = s.recv(1024).decode(errors='ignore')
            if 'Success' not in resp:
                s.close()
                return Response({'error': f'AMI login failed: {resp[:200]}'}, status=502)

            # First, try to find the channel via QueueStatus or use the uniqueid
            # We'll use Redirect with the call's uniqueid to find the channel
            action_id = f'answer-{call_id}-{int(time.time())}'

            # Try redirecting by uniqueid — Asterisk 11+ supports this
            cmd = (
                f'Action: Redirect\r\n'
                f'ActionID: {action_id}\r\n'
                f'Channel: {call.uniqueid}\r\n'
                f'Exten: {agent_ext}\r\n'
                f'Context: from-internal\r\n'
                f'Priority: 1\r\n'
                f'ExtraChannel: {call.uniqueid}\r\n'
                f'ExtraExten: {agent_ext}\r\n'
                f'ExtraContext: from-internal\r\n'
                f'ExtraPriority: 1\r\n'
                f'\r\n'
            )
            s.sendall(cmd.encode())
            time.sleep(0.5)
            resp = s.recv(2048).decode(errors='ignore')
            s.close()

            # Update call record
            call.agent = request.user
            call.status = 'answered'
            call.started_at = tz.now()
            call.save(update_fields=['agent', 'status', 'started_at'])

            if 'Success' in resp or 'Redirect' in resp:
                return Response({
                    'message': f'Call bridged to extension {agent_ext}',
                    'call_id': str(call.id),
                    'ami_response': resp[:200],
                })
            else:
                # Even if AMI response isn't perfect, we marked the call as answered
                return Response({
                    'message': f'Attempted to bridge call to extension {agent_ext}',
                    'call_id': str(call.id),
                    'ami_response': resp[:200],
                })

        except Exception as e:
            return Response({'error': f'AMI connection failed: {str(e)}'}, status=503)
