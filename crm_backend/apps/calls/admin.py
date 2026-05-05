from django.contrib import admin

from .models import CallAgentEvent


@admin.register(CallAgentEvent)
class CallAgentEventAdmin(admin.ModelAdmin):
    list_display = [
        'created_at',
        'call',
        'agent',
        'event_type',
        'ring_duration',
    ]
    list_filter = ['event_type', 'agent', 'created_at']
    search_fields = [
        'call__uniqueid',
        'call__caller',
        'agent__first_name',
        'agent__last_name',
        'agent__email',
        'note',
    ]
    readonly_fields = ['created_at', 'updated_at']
