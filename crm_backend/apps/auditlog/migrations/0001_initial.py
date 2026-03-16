import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('users', '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id',          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('action',      models.CharField(max_length=50)),
                ('model_name',  models.CharField(max_length=100, blank=True)),
                ('object_id',   models.CharField(max_length=100, blank=True)),
                ('object_repr', models.TextField(blank=True)),
                ('changes',     models.JSONField(default=dict, blank=True)),
                ('ip_address',  models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent',  models.TextField(blank=True)),
                ('user',        models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='audit_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'audit_logs', 'ordering': ['-created_at']},
        ),
    ]
