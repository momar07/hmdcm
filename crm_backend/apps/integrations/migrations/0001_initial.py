import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='IntegrationSetting',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key',        models.CharField(max_length=100, unique=True)),
                ('value',      models.TextField(blank=True)),
                ('is_secret',  models.BooleanField(default=False)),
                ('description',models.TextField(blank=True)),
            ],
            options={'db_table': 'integration_settings'},
        ),
    ]
