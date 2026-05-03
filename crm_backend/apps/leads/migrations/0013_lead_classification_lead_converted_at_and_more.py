from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0012_leadtag_alter_lead_phone_alter_lead_tags'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='lead',
                    name='classification',
                    field=models.CharField(default='none', max_length=50),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='converted_at',
                    field=models.DateTimeField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='converted_to_customer',
                    field=models.BooleanField(default=False),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='lifecycle_stage',
                    field=models.CharField(default='lead', max_length=50),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='score',
                    field=models.IntegerField(default=0),
                ),
            ],
            database_operations=[],
        ),
    ]
