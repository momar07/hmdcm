from rest_framework import viewsets, permissions
from .models import SystemSetting
from .serializers import SystemSettingSerializer
from .selectors import get_all_settings
from apps.common.permissions import IsAdmin


class SystemSettingViewSet(viewsets.ModelViewSet):
    serializer_class   = SystemSettingSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        return get_all_settings()
