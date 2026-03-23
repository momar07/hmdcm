from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, QueueViewSet, AgentQueueStatusView, LiveAgentsView

router = DefaultRouter()
router.register('queues', QueueViewSet, basename='queue')
router.register('', UserViewSet, basename='user')

urlpatterns = [
    path('me/queue-status/', AgentQueueStatusView.as_view(), name='agent-queue-status'),
    path('live-agents/',     LiveAgentsView.as_view(),       name='live-agents'),
    path('queues-list/',     QueuesListView.as_view(),        name='queues-list'),
    path('', include(router.urls)),
]
