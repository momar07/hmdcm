import uuid
from django.db import models
from apps.common.models import BaseModel


class Note(BaseModel):
    """Polymorphic notes attached to Lead or Call."""
    author   = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='notes')
    content  = models.TextField()
    is_pinned = models.BooleanField(default=False)

    # Generic relations
    lead     = models.ForeignKey('leads.Lead', null=True, blank=True,
                                  on_delete=models.CASCADE, related_name='note_set')
    call     = models.ForeignKey('calls.Call', null=True, blank=True,
                                  on_delete=models.CASCADE, related_name='note_set')

    class Meta:
        db_table = 'notes'
        ordering = ['-is_pinned', '-created_at']

    def __str__(self):
        return f'Note by {self.author} @ {self.created_at}'
