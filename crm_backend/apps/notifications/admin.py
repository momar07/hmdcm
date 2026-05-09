from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ('id', 'recipient', 'type', 'title', 'priority', 'is_read', 'created_at')
    list_filter   = ('type', 'priority', 'is_read', 'created_at')
    search_fields = ('title', 'body', 'recipient__email')
    readonly_fields = ('id', 'created_at', 'read_at')
    ordering = ('-created_at',)
