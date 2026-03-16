from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import Customer, CustomerTag
from .serializers import (CustomerListSerializer, CustomerDetailSerializer,
                           CustomerTagSerializer, CustomerPhoneSerializer)
from .selectors import get_all_customers, search_customers
from .services import create_customer, add_phone_to_customer


class CustomerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active', 'assigned_to', 'country', 'source']
    search_fields = ['first_name', 'last_name', 'email', 'company', 'phones__number']
    ordering_fields = ['first_name', 'created_at']

    def get_queryset(self):
        return get_all_customers(user=self.request.user)

    def get_serializer_class(self):
        if self.action in ('list',):
            return CustomerListSerializer
        return CustomerDetailSerializer

    @action(detail=True, methods=['post'], url_path='phones')
    def add_phone(self, request, pk=None):
        serializer = CustomerPhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = add_phone_to_customer(pk, **serializer.validated_data)
        return Response(CustomerPhoneSerializer(phone).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        q = request.query_params.get('q', '')
        customers = search_customers(q)
        serializer = CustomerListSerializer(customers, many=True)
        return Response(serializer.data)


class CustomerTagViewSet(viewsets.ModelViewSet):
    queryset = CustomerTag.objects.all()
    serializer_class = CustomerTagSerializer
    permission_classes = [permissions.IsAuthenticated]
