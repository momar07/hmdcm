from rest_framework import generics, permissions
from .models import AuditLog, ActivityLog
from .serializers import AuditLogSerializer, ActivityLogSerializer
from apps.common.permissions import IsAdmin, IsSupervisor


class AuditLogListView(generics.ListAPIView):
    serializer_class   = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        return AuditLog.objects.select_related('user').order_by('-timestamp')[:500]


class ActivityLogListView(generics.ListAPIView):
    serializer_class   = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get_queryset(self):
        return ActivityLog.objects.select_related('user').order_by('-timestamp')[:200]
