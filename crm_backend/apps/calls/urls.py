from django.urls import path, include
from rest_framework.routers import DefaultRouter, SimpleRouter
from .views import (
    MarkCallAnsweredView,
    RejectCallView,
    AgentCallStatsView,
    StartWebrtcCallView,
    EndWebrtcCallView,
    CallViewSet,
    CallCompleteView,
    PendingCompletionsView,
    DispositionsListView,
    LeadStagesListView,
    ScreenPopView,
    DispositionViewSet,
    DispositionActionViewSet,
)

# SimpleRouter — لا يعمل API root page فلا يحجب /api/calls/
calls_router = SimpleRouter()
calls_router.register(r'list', CallViewSet, basename='call')

# router منفصل للـ dispositions CRUD
disp_router = SimpleRouter()
disp_router.register(r'dispositions-crud', DispositionViewSet, basename='disposition-crud')
disp_router.register(r'disposition-actions', DispositionActionViewSet, basename='disposition-action')

urlpatterns = [
    # explicit paths أولاً
    path('complete/<uuid:call_id>/',         CallCompleteView.as_view(),       name='call-complete'),
    path('pending-completions/',             PendingCompletionsView.as_view(), name='pending-completions'),
    path('dispositions-list/',               DispositionsListView.as_view(),   name='dispositions-list'),
    path('lead-stages/',                     LeadStagesListView.as_view(),     name='lead-stages'),
    path('screen-pop/',                      ScreenPopView.as_view(),          name='screen-pop'),
    path('start-webrtc-call/',               StartWebrtcCallView.as_view(),    name='start-webrtc-call'),
    path('end-webrtc-call/<uuid:call_id>/',  EndWebrtcCallView.as_view(),      name='end-webrtc-call'),
    path('mark-answered/<uuid:call_id>/',    MarkCallAnsweredView.as_view(),   name='mark-answered'),
    path('reject/<uuid:call_id>/',           RejectCallView.as_view(),         name='reject-call'),
    path('agent-stats/',                     AgentCallStatsView.as_view(),      name='agent-call-stats'),
    # routers — calls_router أولاً عشان ما يتغلبش بـ disp_router
    path('', include(calls_router.urls)),
    path('', include(disp_router.urls)),
]
