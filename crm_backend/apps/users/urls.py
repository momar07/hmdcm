from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, QueueViewSet

router = DefaultRouter()
router.register(r'', UserViewSet, basename='user')
router.register(r'queues', QueueViewSet, basename='queue')

urlpatterns = [path('', include(router.urls))]
