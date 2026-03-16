from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IntegrationSettingViewSet

router = DefaultRouter()
router.register(r'settings', IntegrationSettingViewSet, basename='integration-setting')
urlpatterns = [path('', include(router.urls))]
