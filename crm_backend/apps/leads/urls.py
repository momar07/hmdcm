from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LeadViewSet, LeadStatusViewSet, LeadPriorityViewSet, LeadStageViewSet

router = DefaultRouter()
router.register(r'stages',     LeadStageViewSet,    basename='lead-stage')
router.register(r'statuses',   LeadStatusViewSet,   basename='lead-status')
router.register(r'priorities', LeadPriorityViewSet, basename='lead-priority')
router.register(r'',           LeadViewSet,         basename='lead')

urlpatterns = [path('', include(router.urls))]
