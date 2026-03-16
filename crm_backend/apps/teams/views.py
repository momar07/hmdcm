from rest_framework import viewsets, permissions
from .models import Team
from .serializers import TeamSerializer
from .selectors import get_all_teams
from apps.common.permissions import IsAdminOrSupervisor


class TeamViewSet(viewsets.ModelViewSet):
    serializer_class = TeamSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminOrSupervisor]

    def get_queryset(self):
        return get_all_teams()
