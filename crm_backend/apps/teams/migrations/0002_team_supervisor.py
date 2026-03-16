import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('teams', '0001_initial'),
        ('users', '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='team',
            name='supervisor',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='supervised_teams',
                limit_choices_to={'role': 'supervisor'},
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
