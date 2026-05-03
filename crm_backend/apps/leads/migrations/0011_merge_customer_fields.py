from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('customers', '0001_initial'),
        ('leads', '0010_lead_phone_nullable'),
    ]

    operations = [
        # These fields already exist in DB — add to Django state only
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='lead',
                    name='first_name',
                    field=models.CharField(blank=True, db_index=True, max_length=150),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='last_name',
                    field=models.CharField(blank=True, db_index=True, max_length=150),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='email',
                    field=models.EmailField(blank=True, db_index=True, max_length=254),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='address',
                    field=models.TextField(blank=True),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='city',
                    field=models.CharField(blank=True, max_length=100),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='country',
                    field=models.CharField(default='Egypt', max_length=100),
                ),
                migrations.AddField(
                    model_name='lead',
                    name='company',
                    field=models.CharField(blank=True, max_length=200),
                ),
            ],
            database_operations=[],
        ),
        # These fields need to be added to DB
        migrations.AddField(
            model_name='lead',
            name='gender',
            field=models.CharField(blank=True, choices=[('M', 'Male'), ('F', 'Female'), ('O', 'Other')], max_length=1),
        ),
        migrations.AddField(
            model_name='lead',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='notes',
            field=models.TextField(blank=True, help_text='Internal notes about this lead'),
        ),
        migrations.AddField(
            model_name='lead',
            name='tags',
            field=models.ManyToManyField(blank=True, related_name='leads', to='customers.customertag'),
        ),
        # Remove customer FK
        migrations.RemoveField(
            model_name='lead',
            name='customer',
        ),
        # Add name index
        migrations.AddIndex(
            model_name='lead',
            index=models.Index(fields=['first_name', 'last_name'], name='leads_name_idx'),
        ),
    ]
