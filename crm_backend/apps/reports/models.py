import uuid
from django.db import models
from apps.common.models import BaseModel


class SavedReport(BaseModel):
    REPORT_TYPES = [
        ('agent_performance', 'Agent Performance'),
        ('call_summary',      'Call Summary'),
        ('lead_pipeline',     'Lead Pipeline'),
        ('followup_rate',     'Follow-up Rate'),
        ('campaign_stats',    'Campaign Stats'),
    ]

    name        = models.CharField(max_length=300)
    report_type = models.CharField(max_length=30, choices=REPORT_TYPES)
    filters     = models.JSONField(default=dict, blank=True)
    created_by  = models.ForeignKey('users.User', on_delete=models.CASCADE)
    is_public   = models.BooleanField(default=False)

    class Meta:
        db_table = 'saved_reports'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.report_type})'
