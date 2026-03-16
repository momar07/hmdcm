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
            name='Campaign',
            fields=[
                ('id',            models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',    models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',    models.DateTimeField(auto_now=True)),
                ('name',          models.CharField(max_length=300)),
                ('description',   models.TextField(blank=True)),
                ('campaign_type', models.CharField(
                    choices=[('outbound','Outbound Calling'),('inbound','Inbound Queue'),('blended','Blended')],
                    default='outbound', max_length=10,
                )),
                ('status',        models.CharField(
                    choices=[('draft','Draft'),('active','Active'),('paused','Paused'),('completed','Completed'),('cancelled','Cancelled')],
                    default='draft', max_length=10,
                )),
                ('start_date',    models.DateField(blank=True, null=True)),
                ('end_date',      models.DateField(blank=True, null=True)),
                ('daily_limit',   models.PositiveIntegerField(default=0)),
                ('is_active',     models.BooleanField(default=True)),
                ('queue',         models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='campaigns', to='users.queue',
                )),
                ('created_by',    models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='created_campaigns',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'campaigns', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='CampaignMember',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status',     models.CharField(
                    choices=[('pending','Pending'),('called','Called'),('answered','Answered'),
                             ('do_not_call','Do Not Call'),('completed','Completed')],
                    default='pending', max_length=15,
                )),
                ('attempts',   models.PositiveIntegerField(default=0)),
                ('campaign',   models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='campaigns.campaign')),
                ('customer',   models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='customers.customer')),
            ],
            options={
                'db_table': 'campaign_members',
                'unique_together': {('campaign', 'customer')},
            },
        ),
    ]
