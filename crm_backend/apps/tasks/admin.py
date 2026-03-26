from django.contrib import admin
from .models import Task, TaskLog

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display  = ['title', 'assigned_to', 'priority', 'status', 'due_date', 'is_overdue']
    list_filter   = ['status', 'priority']
    search_fields = ['title', 'assigned_to__first_name']

@admin.register(TaskLog)
class TaskLogAdmin(admin.ModelAdmin):
    list_display = ['task', 'actor', 'action', 'created_at']
    readonly_fields = ['created_at']
