from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Call, Disposition
from .serializers import (CallListSerializer, CallDetailSerializer,
                           OriginateCallSerializer, DispositionSerializer,
                           CallDispositionSerializer)
from .selectors import get_all_calls
from .services import submit_disposition
from apps.common.permissions import IsAgent


class CallViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['direction', 'status', 'agent', 'queue']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        return get_all_calls(user=self.request.user)

    def get_serializer_class(self):
        return CallDetailSerializer if self.action == 'retrieve' else CallListSerializer

    @action(detail=False, methods=['post'], url_path='originate')
    def originate(self, request):
        """Click-to-call endpoint."""
        serializer = OriginateCallSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from apps.integrations.services import originate_call
        result = originate_call(
            agent=request.user,
            phone_number=serializer.validated_data['phone_number'],
            customer_id=serializer.validated_data.get('customer_id'),
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='screen-pop')
    def screen_pop(self, request):
        """Resolve customer from caller phone number."""
        phone = request.query_params.get('phone', '')
        from apps.customers.selectors import find_customer_by_phone
        from apps.customers.serializers import CustomerDetailSerializer
        customer = find_customer_by_phone(phone)
        if customer:
            return Response({'found': True, 'customer': CustomerDetailSerializer(customer).data})
        return Response({'found': False, 'customer': None})

    @action(detail=True, methods=['post'], url_path='disposition')
    def add_disposition(self, request, pk=None):
        call = self.get_object()
        disp = submit_disposition(
            call_id=call.id,
            disposition_id=request.data.get('disposition_id'),
            agent_id=request.user.id,
            notes=request.data.get('notes', ''),
        )
        return Response(CallDispositionSerializer(disp).data, status=status.HTTP_201_CREATED)


class DispositionViewSet(viewsets.ModelViewSet):
    queryset = Disposition.objects.filter(is_active=True)
    serializer_class = DispositionSerializer
    permission_classes = [permissions.IsAuthenticated]
