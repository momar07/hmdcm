from rest_framework.views import APIView
from rest_framework import viewsets, permissions
from rest_framework.response import Response
from .selectors import (
    get_agent_performance_report,
    get_call_summary_report,
    get_lead_pipeline_report,
    get_followup_rate_report,
    get_campaign_stats_report,
)
from .models import SavedReport
from .serializers import SavedReportSerializer
from apps.common.permissions import IsSupervisor


class AgentReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        data = get_agent_performance_report(
            team_id=request.query_params.get('team_id'),
        )
        return Response(data)


class CallSummaryReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(get_call_summary_report())


class LeadPipelineReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(get_lead_pipeline_report())


class FollowupRateReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(get_followup_rate_report())


class CampaignStatsReportView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(
            get_campaign_stats_report(request.query_params.get('campaign_id'))
        )


class SavedReportViewSet(viewsets.ModelViewSet):
    serializer_class   = SavedReportSerializer
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get_queryset(self):
        return SavedReport.objects.filter(
            created_by=self.request.user
        ) | SavedReport.objects.filter(is_public=True)
