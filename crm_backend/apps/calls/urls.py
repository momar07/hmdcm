from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CallViewSet, DispositionViewSet

router = DefaultRouter()
router.register(r'dispositions', DispositionViewSet, basename='disposition')
router.register(r'', CallViewSet, basename='call')

urlpatterns = [path('', include(router.urls))]
