import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('customers', '0001_initial'),
        ('leads',     '0001_initial'),
        ('calls',     '0001_initial'),
        ('users',     '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='Note',
            fields=[
                ('id',        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',models.DateTimeField(auto_now=True)),
                ('content',   models.TextField()),
                ('is_pinned', models.BooleanField(default=False)),
                ('author',    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notes', to=settings.AUTH_USER_MODEL)),
                ('customer',  models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='note_set', to='customers.customer')),
                ('lead',      models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='note_set', to='leads.lead')),
                ('call',      models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='note_set', to='calls.call')),
            ],
            options={'db_table': 'notes', 'ordering': ['-is_pinned', '-created_at']},
        ),
    ]
