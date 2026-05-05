from django.contrib import admin

from .models import LeadEvent


@admin.register(LeadEvent)
class LeadEventAdmin(admin.ModelAdmin):
    list_display = [
        'created_at',
        'lead',
        'event_type',
        'actor',
    ]
    list_filter = ['event_type', 'actor', 'created_at']
    search_fields = [
        'lead__title',
        'lead__phone',
        'actor__first_name',
        'actor__last_name',
        'actor__email',
        'note',
        'new_value',
    ]
    readonly_fields = ['created_at', 'updated_at']
