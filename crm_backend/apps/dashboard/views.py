from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from .selectors import (
    get_agent_dashboard,
    get_supervisor_dashboard,
    get_admin_dashboard,
)


class DashboardView(APIView):
    """
    Returns role-appropriate dashboard stats.
    Single endpoint — frontend decides which widgets to render.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == 'admin':
            data = get_admin_dashboard()
            data['role'] = 'admin'
        elif user.role == 'supervisor':
            data = get_supervisor_dashboard(user)
            data['role'] = 'supervisor'
        else:
            data = get_agent_dashboard(user)
            data['role'] = 'agent'
        return Response(data)
