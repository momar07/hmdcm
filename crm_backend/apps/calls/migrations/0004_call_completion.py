import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('calls', '0003_rename_calls_status_agent_idx_calls_status_0ea02e_idx_and_more'),
        ('leads', '0004_lead_stages_and_new_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [

        # DISPOSITION — أضف الحقول الناقصة بدون أي unique
        migrations.AddField(
            model_name='disposition',
            name='code',
            field=models.SlugField(max_length=50, default='', unique=False),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='disposition',
            name='default_next_action',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='disposition',
            name='order',
            field=models.PositiveIntegerField(default=0),
        ),

        # CALL_EVENTS — rename event → event_type, حذف timestamp
        migrations.RenameField(
            model_name='callevent',
            old_name='event',
            new_name='event_type',
        ),
        migrations.RemoveField(
            model_name='callevent',
            name='timestamp',
        ),

        # CALL_RECORDINGS — rename file_url → url, حذف حقول زيادة
        migrations.RenameField(
            model_name='callrecording',
            old_name='file_url',
            new_name='url',
        ),
        migrations.AddField(
            model_name='callrecording',
            name='filename',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.RemoveField(
            model_name='callrecording',
            name='file_path',
        ),
        migrations.RemoveField(
            model_name='callrecording',
            name='file_size',
        ),
        migrations.RemoveField(
            model_name='callrecording',
            name='format',
        ),

        # CALL — أضف الحقول الجديدة
        migrations.AddField(
            model_name='call',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='call',
            name='is_completed',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='call',
            name='caller',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='call',
            name='callee',
            field=models.CharField(blank=True, default='', max_length=50),
        ),

        # CALL_COMPLETIONS — جديدة تماماً
        migrations.CreateModel(
            name='CallCompletion',
            fields=[
                ('id',                   models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at',           models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',           models.DateTimeField(auto_now=True)),
                ('note',                 models.TextField()),
                ('next_action',          models.CharField(max_length=50)),
                ('followup_required',    models.BooleanField(default=False)),
                ('followup_due_at',      models.DateTimeField(blank=True, null=True)),
                ('followup_type',        models.CharField(blank=True, default='', max_length=50)),
                ('update_lead_stage',    models.BooleanField(default=False)),
                ('call', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='completion',
                    to='calls.call',
                )),
                ('disposition', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='completions',
                    to='calls.disposition',
                )),
                ('agent', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='call_completions',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('new_stage', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='completions',
                    to='leads.leadstage',
                )),
                ('followup_assigned_to', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_completions',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'db_table': 'call_completions', 'ordering': ['-created_at']},
        ),

        # INDEX — موجود بالفعل، سجّله فقط بدون SQL
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name='call',
                    index=models.Index(fields=['caller'], name='calls_caller__609c68_idx'),
                ),
            ],
        ),
    ]
