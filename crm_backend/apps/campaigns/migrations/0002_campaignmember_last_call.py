import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('campaigns', '0001_initial'),
        ('calls',     '0001_initial'),
    ]
    operations = [
        migrations.AddField(
            model_name='campaignmember',
            name='last_call',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='campaign_member_calls',
                to='calls.call',
            ),
        ),
    ]
