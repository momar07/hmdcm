import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('customers', '0001_initial'),
        ('users',     '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='LeadStatus',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('name',       models.CharField(max_length=100, unique=True)),
                ('color',      models.CharField(default='#6366f1', max_length=7)),
                ('order',      models.PositiveIntegerField(default=0)),
                ('is_closed',  models.BooleanField(default=False)),
                ('is_won',     models.BooleanField(default=False)),
                ('is_default', models.BooleanField(default=False)),
            ],
            options={'db_table': 'lead_statuses', 'ordering': ['order']},
        ),
        migrations.CreateModel(
            name='LeadPriority',
            fields=[
                ('id',    models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('name',  models.CharField(max_length=50, unique=True)),
                ('level', models.PositiveIntegerField(default=0)),
                ('color', models.CharField(default='#64748b', max_length=7)),
            ],
            options={'db_table': 'lead_priorities', 'ordering': ['level']},
        ),
        migrations.CreateModel(
            name='Lead',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',   models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',   models.DateTimeField(auto_now=True)),
                ('title',        models.CharField(max_length=300)),
                ('source',       models.CharField(
                    choices=[('call','Inbound Call'),('web','Website'),('referral','Referral'),
                             ('campaign','Campaign'),('social','Social Media'),('walk_in','Walk-in'),
                             ('email','Email'),('manual','Manual Entry'),('other','Other')],
                    default='manual', max_length=20,
                )),
                ('description',   models.TextField(blank=True)),
                ('value',         models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('followup_date', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('closed_at',     models.DateTimeField(blank=True, null=True)),
                ('is_active',     models.BooleanField(default=True)),
                ('customer',      models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='leads', to='customers.customer')),
                ('status',        models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='leads', to='leads.leadstatus')),
                ('priority',      models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='leads', to='leads.leadpriority')),
                ('assigned_to',   models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_leads',
                    to=settings.AUTH_USER_MODEL,
                )),
                # campaign FK added in leads/0002
            ],
            options={
                'db_table': 'leads',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['status', 'assigned_to'], name='leads_status_agent_idx'),
                    models.Index(fields=['followup_date'], name='leads_followup_idx'),
                ],
            },
        ),
    ]
