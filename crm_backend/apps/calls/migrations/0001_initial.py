import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('customers', '0001_initial'),
        ('users',     '0001_initial'),
        ('auth',      '0012_alter_user_first_name_max_length'),
    ]
    operations = [
        migrations.CreateModel(
            name='Disposition',
            fields=[
                ('id',                models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',        models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',        models.DateTimeField(auto_now=True)),
                ('name',              models.CharField(max_length=200, unique=True)),
                ('description',       models.TextField(blank=True)),
                ('color',             models.CharField(default='#6366f1', max_length=7)),
                ('requires_followup', models.BooleanField(default=False)),
                ('is_active',         models.BooleanField(default=True)),
            ],
            options={'db_table': 'dispositions', 'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='Call',
            fields=[
                ('id',             models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',     models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',     models.DateTimeField(auto_now=True)),
                ('uniqueid',       models.CharField(db_index=True, max_length=100, unique=True)),
                ('linkedid',       models.CharField(blank=True, db_index=True, max_length=100)),
                ('caller_number',  models.CharField(db_index=True, max_length=30)),
                ('callee_number',  models.CharField(db_index=True, max_length=30)),
                ('direction',      models.CharField(
                    choices=[('inbound','Inbound'),('outbound','Outbound'),('internal','Internal')],
                    max_length=10,
                )),
                ('status',         models.CharField(
                    choices=[('ringing','Ringing'),('answered','Answered'),('no_answer','No Answer'),
                             ('busy','Busy'),('failed','Failed'),('voicemail','Voicemail'),('transferred','Transferred')],
                    default='ringing', max_length=15,
                )),
                ('duration',       models.PositiveIntegerField(default=0)),
                ('wait_time',      models.PositiveIntegerField(default=0)),
                ('started_at',     models.DateTimeField(blank=True, null=True)),
                ('answered_at',    models.DateTimeField(blank=True, null=True)),
                ('ended_at',       models.DateTimeField(blank=True, null=True)),
                ('recording_file', models.CharField(blank=True, max_length=500)),
                ('recording_url',  models.URLField(blank=True)),
                ('notes',          models.TextField(blank=True)),
                ('agent',          models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calls', to=settings.AUTH_USER_MODEL,
                )),
                ('customer',       models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calls', to='customers.customer',
                )),
                ('extension',      models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calls', to='users.extension',
                )),
                ('queue',          models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='calls', to='users.queue',
                )),
            ],
            options={
                'db_table': 'calls',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['status', 'agent'], name='calls_status_agent_idx'),
                    models.Index(fields=['started_at'],      name='calls_started_at_idx'),
                    models.Index(fields=['caller_number'],   name='calls_caller_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='CallEvent',
            fields=[
                ('id',        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',models.DateTimeField(auto_now=True)),
                ('call',      models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='calls.call')),
                ('event',     models.CharField(
                    choices=[('dial','Dial'),('answer','Answer'),('hangup','Hangup'),
                             ('transfer','Transfer'),('hold','Hold'),('unhold','Unhold'),
                             ('dtmf','DTMF'),('bridge','Bridge')],
                    max_length=20,
                )),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('data',      models.JSONField(blank=True, default=dict)),
            ],
            options={'db_table': 'call_events', 'ordering': ['timestamp']},
        ),
        migrations.CreateModel(
            name='CallRecording',
            fields=[
                ('id',        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',models.DateTimeField(auto_now=True)),
                ('call',      models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='recording', to='calls.call')),
                ('file_path', models.CharField(max_length=500)),
                ('file_url',  models.URLField(blank=True)),
                ('file_size', models.PositiveIntegerField(default=0)),
                ('format',    models.CharField(default='wav', max_length=10)),
                ('duration',  models.PositiveIntegerField(default=0)),
            ],
            options={'db_table': 'call_recordings'},
        ),
        migrations.CreateModel(
            name='CallDisposition',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',   models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',   models.DateTimeField(auto_now=True)),
                ('call',         models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='disposition', to='calls.call')),
                ('disposition',  models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='calls.disposition')),
                ('agent',        models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
                ('notes',        models.TextField(blank=True)),
                ('submitted_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'db_table': 'call_dispositions'},
        ),
    ]
