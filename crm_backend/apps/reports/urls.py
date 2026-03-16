from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AgentReportView,
    CallSummaryReportView,
    LeadPipelineReportView,
    FollowupRateReportView,
    CampaignStatsReportView,
    SavedReportViewSet,
)

router = DefaultRouter()
router.register(r'saved', SavedReportViewSet, basename='saved-report')

urlpatterns = [
    path('agents/',           AgentReportView.as_view(),        name='report-agents'),
    path('calls/summary/',    CallSummaryReportView.as_view(),   name='report-calls-summary'),
    path('leads/pipeline/',   LeadPipelineReportView.as_view(),  name='report-lead-pipeline'),
    path('followups/rate/',   FollowupRateReportView.as_view(),  name='report-followup-rate'),
    path('campaigns/stats/',  CampaignStatsReportView.as_view(), name='report-campaign-stats'),
    path('', include(router.urls)),
]
