from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, CustomerTagViewSet, CustomerHistoryView

router = DefaultRouter()
router.register(r'tags', CustomerTagViewSet, basename='customer-tag')
router.register(r'',     CustomerViewSet,    basename='customer')

urlpatterns = [
    path('<uuid:pk>/history/', CustomerHistoryView.as_view(), name='customer-history'),
    path('', include(router.urls)),
]
