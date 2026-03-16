import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='Team',
            fields=[
                ('id',          models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('name',        models.CharField(max_length=200, unique=True)),
                ('description', models.TextField(blank=True)),
                ('is_active',   models.BooleanField(default=True)),
            ],
            options={'db_table': 'teams', 'ordering': ['name']},
        ),
    ]
