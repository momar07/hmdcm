import uuid
from django.db import models
from apps.common.models import BaseModel


class SystemSetting(BaseModel):
    """
    Key-value store for runtime system configuration
    editable by admins without redeployment.
    """
    CATEGORY_CHOICES = [
        ('general',     'General'),
        ('telephony',   'Telephony'),
        ('security',    'Security'),
        ('notifications','Notifications'),
    ]

    key         = models.CharField(max_length=100, unique=True)
    value       = models.TextField()
    description = models.TextField(blank=True)
    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='general')
    is_public   = models.BooleanField(default=False,
                                      help_text='Expose to non-admin API consumers')

    class Meta:
        db_table = 'system_settings'
        ordering = ['category', 'key']

    def __str__(self):
        return f'{self.category}.{self.key}'
