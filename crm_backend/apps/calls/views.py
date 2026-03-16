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

    @action(detail=True, methods=['post'], url_path='originate')
    def originate(self, request, pk=None):
        return Response({'message': 'Originate action placeholder.'})


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
