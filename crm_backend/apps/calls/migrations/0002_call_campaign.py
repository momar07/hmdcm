import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('calls',     '0001_initial'),
        ('campaigns', '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='call',
            name='campaign',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='calls', to='campaigns.campaign',
            ),
        ),
    ]
