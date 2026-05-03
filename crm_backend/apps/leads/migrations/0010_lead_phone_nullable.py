from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0009_add_lead_events'),
        ('customers', '0001_initial'),
    ]

    operations = [
        # phone column exists in DB — add to Django state only, no DB change
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='lead',
                    name='phone',
                    field=models.CharField(blank=True, db_index=True, help_text='Primary phone', max_length=30),
                ),
            ],
            database_operations=[],
        ),
        # Make customer nullable in DB
        migrations.AlterField(
            model_name='lead',
            name='customer',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='leads', to='customers.customer'),
        ),
        # Add phone index
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['phone'], name='leads_phone_idx'),
        ),
    ]
