import uuid
from django.db import models
from apps.common.models import TimeStampedModel


class Team(TimeStampedModel):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    supervisor  = models.ForeignKey(
        'users.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='supervised_teams',
        limit_choices_to={'role': 'supervisor'},
    )
    is_active   = models.BooleanField(default=True)

    class Meta:
        db_table = 'teams'
        ordering = ['name']

    def __str__(self):
        return self.name
