from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MarkCallAnsweredView,
    RejectCallView,
    StartWebrtcCallView,
    EndWebrtcCallView,
    CallViewSet,
    CallCompleteView,
    PendingCompletionsView,
    DispositionsListView,
    LeadStagesListView,
    ScreenPopView,
    LinkCallToCustomerView,
    DispositionViewSet,
    DispositionActionViewSet,
)

# router للـ calls العادي
calls_router = DefaultRouter()
calls_router.register(r'calls-list', CallViewSet, basename='call')

# router منفصل للـ dispositions CRUD
disp_router = DefaultRouter()
disp_router.register(r'dispositions-crud', DispositionViewSet, basename='disposition-crud')
disp_router.register(r'disposition-actions', DispositionActionViewSet, basename='disposition-action')

urlpatterns = [
    # explicit paths أولاً
    path('complete/<uuid:call_id>/',         CallCompleteView.as_view(),       name='call-complete'),
    path('pending-completions/',             PendingCompletionsView.as_view(), name='pending-completions'),
    path('dispositions-list/',               DispositionsListView.as_view(),   name='dispositions-list'),
    path('lead-stages/',                     LeadStagesListView.as_view(),     name='lead-stages'),
    path('screen-pop/',                      ScreenPopView.as_view(),          name='screen-pop'),
    path('link-call/',                       LinkCallToCustomerView.as_view(), name='link-call'),
    path('start-webrtc-call/',               StartWebrtcCallView.as_view(),    name='start-webrtc-call'),
    path('end-webrtc-call/<uuid:call_id>/',  EndWebrtcCallView.as_view(),      name='end-webrtc-call'),
    # routers
    path('', include(disp_router.urls)),
    path('', include(calls_router.urls)),
]
