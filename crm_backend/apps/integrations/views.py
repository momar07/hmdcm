from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import IntegrationSetting
from .serializers import IntegrationSettingSerializer, IntegrationSettingWriteSerializer
from .selectors import get_all_settings
from .services import sync_cdr_records, originate_call
from apps.common.permissions import IsAdmin


class IntegrationSettingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        return get_all_settings()

    def get_serializer_class(self):
        if self.request.method in ('POST', 'PUT', 'PATCH'):
            return IntegrationSettingWriteSerializer
        return IntegrationSettingSerializer

    @action(detail=False, methods=['post'], url_path='sync-cdr')
    def trigger_cdr_sync(self, request):
        from .tasks import sync_cdr_task
        sync_cdr_task.delay()
        return Response({'detail': 'CDR sync task queued.'})

    @action(detail=False, methods=['get'], url_path='ami-status')
    def ami_status(self, request):
        try:
            connect_ami = __import__(
                'apps.integrations.services', fromlist=['connect_ami']
            ).connect_ami
            connect_ami()
            return Response({'status': 'connected'})
        except Exception as exc:
            return Response({'status': 'error', 'detail': str(exc)},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)
