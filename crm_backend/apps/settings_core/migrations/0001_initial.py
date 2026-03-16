import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='SystemSetting',
            fields=[
                ('id',          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('key',         models.CharField(max_length=200, unique=True)),
                ('value',       models.TextField(blank=True)),
                ('description', models.TextField(blank=True)),
                ('group',       models.CharField(max_length=100, default='general')),
            ],
            options={'db_table': 'system_settings'},
        ),
    ]
