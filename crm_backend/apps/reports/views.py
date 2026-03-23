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


class AgentAttendanceReportView(APIView):
    """
    GET /api/reports/agents/attendance/
    Query params:
      - date_from  (YYYY-MM-DD, default: today)
      - date_to    (YYYY-MM-DD, default: today)
      - agent_id   (UUID, optional)
    Returns per-agent login sessions with break details.
    """
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        from apps.users.models import AgentSession, AgentBreak, User
        from django.utils import timezone
        from django.utils.dateparse import parse_date
        import datetime

        # Date range
        today      = datetime.date.today()  # USE_TZ=False — avoid timezone.localdate()
        date_from  = parse_date(request.query_params.get('date_from', '')) or today
        date_to    = parse_date(request.query_params.get('date_to',   '')) or today
        agent_id   = request.query_params.get('agent_id')

        # USE_TZ=False — use naive datetimes for filtering
        dt_from = datetime.datetime.combine(date_from, datetime.time.min)
        dt_to   = datetime.datetime.combine(date_to,   datetime.time.max)

        sessions_qs = AgentSession.objects.filter(
            login_at__range=(dt_from, dt_to)
        ).select_related('agent').prefetch_related('breaks').order_by('-login_at')

        if agent_id:
            sessions_qs = sessions_qs.filter(agent_id=agent_id)

        result = []
        for s in sessions_qs:
            breaks = []
            total_break_secs = 0
            for b in s.breaks.all():
                dur = b.duration_seconds
                total_break_secs += dur or 0
                breaks.append({
                    'id':          str(b.id),
                    'reason':      b.reason,
                    'break_start': b.break_start.isoformat() if b.break_start else None,
                    'break_end':   b.break_end.isoformat()   if b.break_end   else None,
                    'duration_seconds': dur,
                })

            session_dur  = s.duration_seconds
            active_secs  = (session_dur - total_break_secs) if session_dur else None

            result.append({
                'session_id':          str(s.id),
                'agent_id':            str(s.agent.id),
                'agent_name':          s.agent.get_full_name(),
                'agent_email':         s.agent.email,
                'login_at':            s.login_at.isoformat(),
                'logout_at':           s.logout_at.isoformat() if s.logout_at else None,
                'login_ip':            s.login_ip,
                'session_duration_seconds': session_dur,
                'total_break_seconds': total_break_secs,
                'active_seconds':      active_secs,
                'break_count':         len(breaks),
                'breaks':              breaks,
                'is_active':           s.logout_at is None,
            })

        # Summary per agent
        agent_summary = {}
        for r in result:
            aid = r['agent_id']
            if aid not in agent_summary:
                agent_summary[aid] = {
                    'agent_id':    aid,
                    'agent_name':  r['agent_name'],
                    'agent_email': r['agent_email'],
                    'total_sessions':        0,
                    'total_login_seconds':   0,
                    'total_break_seconds':   0,
                    'total_active_seconds':  0,
                    'total_breaks':          0,
                }
            ag = agent_summary[aid]
            ag['total_sessions']       += 1
            ag['total_login_seconds']  += r['session_duration_seconds'] or 0
            ag['total_break_seconds']  += r['total_break_seconds'] or 0
            ag['total_active_seconds'] += r['active_seconds'] or 0
            ag['total_breaks']         += r['break_count']

        return Response({
            'date_from': date_from.isoformat(),
            'date_to':   date_to.isoformat(),
            'sessions':  result,
            'summary':   list(agent_summary.values()),
        })
