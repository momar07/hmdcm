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
            name='SavedReport',
            fields=[
                ('id',          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('name',        models.CharField(max_length=200)),
                ('report_type', models.CharField(max_length=50)),
                ('filters',     models.JSONField(default=dict, blank=True)),
                ('created_by',  models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='saved_reports',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'saved_reports'},
        ),
    ]
