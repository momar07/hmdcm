from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Followup
from .serializers import FollowupSerializer
from .selectors import get_followups
from .services import complete_followup


class FollowupViewSet(viewsets.ModelViewSet):
    serializer_class = FollowupSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'followup_type', 'assigned_to']

    def get_queryset(self):
        return get_followups(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='complete')
    def complete(self, request, pk=None):
        complete_followup(pk)
        return Response({'detail': 'Followup marked complete.'})
