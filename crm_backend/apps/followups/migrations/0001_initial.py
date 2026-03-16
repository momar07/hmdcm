import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('customers', '0001_initial'),
        ('leads',     '0001_initial'),
        ('calls',     '0001_initial'),
        ('users',     '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='Followup',
            fields=[
                ('id',             models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',     models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',     models.DateTimeField(auto_now=True)),
                ('title',          models.CharField(max_length=300)),
                ('description',    models.TextField(blank=True)),
                ('followup_type',  models.CharField(
                    choices=[('call','Call'),('email','Email'),('meeting','Meeting'),('sms','SMS'),('other','Other')],
                    default='call', max_length=10,
                )),
                ('scheduled_at',   models.DateTimeField(db_index=True)),
                ('completed_at',   models.DateTimeField(blank=True, null=True)),
                ('status',         models.CharField(
                    choices=[('pending','Pending'),('completed','Completed'),('cancelled','Cancelled'),('rescheduled','Rescheduled')],
                    default='pending', max_length=15,
                )),
                ('reminder_sent',  models.BooleanField(default=False)),
                ('customer',       models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='followups', to='customers.customer')),
                ('lead',           models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='followups', to='leads.lead')),
                ('call',           models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='followups', to='calls.call')),
                ('assigned_to',    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='followups', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'followups',
                'ordering': ['scheduled_at'],
                'indexes': [models.Index(fields=['status', 'assigned_to', 'scheduled_at'], name='followups_status_idx')],
            },
        ),
    ]
