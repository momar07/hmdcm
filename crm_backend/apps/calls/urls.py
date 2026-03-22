from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    LinkCallToCustomerView,CallViewSet, CallCompleteView, PendingCompletionsView,
                    DispositionsListView, LeadStagesListView, ScreenPopView)

router = DefaultRouter()
router.register(r'', CallViewSet, basename='call')

urlpatterns = [
    path('complete/<uuid:call_id>/',  CallCompleteView.as_view(),       name='call-complete'),
    path('pending-completions/',      PendingCompletionsView.as_view(),  name='pending-completions'),
    path('dispositions-list/',        DispositionsListView.as_view(),    name='dispositions-list'),
    path('lead-stages/',              LeadStagesListView.as_view(),      name='lead-stages'),
    path('screen-pop/',               ScreenPopView.as_view(),            name='screen-pop'),
    path('', include(router.urls)),
]
