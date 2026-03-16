import uuid
from django.db import models
from apps.common.models import BaseModel


class IntegrationSetting(BaseModel):
    KEY_CHOICES = [
        ('ami_host',       'AMI Host'),
        ('ami_port',       'AMI Port'),
        ('ami_username',   'AMI Username'),
        ('ami_secret',     'AMI Secret (encrypted)'),
        ('recording_url',  'Recording Base URL'),
        ('cdr_sync',       'CDR Sync Enabled'),
        ('cdr_db_host',    'CDR DB Host'),
        ('cdr_db_name',    'CDR DB Name'),
    ]

    key        = models.CharField(max_length=50, choices=KEY_CHOICES, unique=True)
    value      = models.TextField()
    is_secret  = models.BooleanField(default=False)
    updated_by = models.ForeignKey(
        'users.User', null=True, blank=True, on_delete=models.SET_NULL
    )

    class Meta:
        db_table = 'integration_settings'
        ordering = ['key']

    def __str__(self):
        display = '***' if self.is_secret else self.value
        return f'{self.key} = {display}'
