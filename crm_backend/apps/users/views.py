from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import User, Queue
from .serializers import (UserListSerializer, UserDetailSerializer,
                          UserCreateSerializer, UserUpdateSerializer, QueueSerializer)
from .selectors import get_all_users, get_active_queues
from .services import create_user, update_user_status
from apps.common.permissions import IsAdmin, IsSupervisor


class UserViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['role', 'team', 'status', 'is_active']
    search_fields = ['first_name', 'last_name', 'email']

    def get_queryset(self):
        return get_all_users()

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return UserUpdateSerializer
        if self.action == 'retrieve':
            return UserDetailSerializer
        return UserListSerializer

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = create_user(**serializer.validated_data)
        return Response(UserDetailSerializer(user).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path='status')
    def set_status(self, request, pk=None):
        agent_status = request.data.get('status')
        update_user_status(pk, agent_status)
        return Response({'status': agent_status})


class QueueViewSet(viewsets.ModelViewSet):
    serializer_class = QueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get_queryset(self):
        return get_active_queues()
