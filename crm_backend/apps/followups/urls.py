from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FollowupViewSet

router = DefaultRouter()
router.register(r'', FollowupViewSet, basename='followup')
urlpatterns = [path('', include(router.urls))]
