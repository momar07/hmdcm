from django.urls import path
from .views import AuditLogListView, ActivityLogListView

urlpatterns = [
    path('audit/',    AuditLogListView.as_view(),    name='audit-logs'),
    path('activity/', ActivityLogListView.as_view(), name='activity-logs'),
]
