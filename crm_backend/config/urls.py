from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    path('api/auth/',        include('apps.accounts.urls')),
    path('api/users/',       include('apps.users.urls')),
    path('api/teams/',       include('apps.teams.urls')),
    path('api/customers/',   include('apps.customers.urls')),
    path('api/leads/',       include('apps.leads.urls')),
    path('api/calls/',       include('apps.calls.urls')),
    path('api/followups/',   include('apps.followups.urls')),
    path('api/tickets/', include('apps.tickets.urls')),
    path('api/approvals/', include('apps.approvals.urls')),
    path('api/notes/',       include('apps.notes.urls')),
    path('api/campaigns/',   include('apps.campaigns.urls')),
    path('api/reports/',     include('apps.reports.urls')),
    path('api/integrations/',include('apps.integrations.urls')),
    path('api/settings/',    include('apps.settings_core.urls')),
    path('api/dashboard/',   include('apps.dashboard.urls')),
]
