import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0003_rename_leads_status_agent_idx_leads_status__64a296_idx_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. أنشئ جدول lead_stages
        migrations.CreateModel(
            name='LeadStage',
            fields=[
                ('id',          models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at',  models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('name',        models.CharField(max_length=100, unique=True)),
                ('order',       models.PositiveIntegerField(default=0)),
                ('color',       models.CharField(default='#6B7280', max_length=20)),
                ('is_active',   models.BooleanField(default=True)),
                ('description', models.TextField(blank=True, default='')),
            ],
            options={'db_table': 'lead_stages', 'ordering': ['order']},
        ),

        # 2. lead_priorities: rename level -> order
        migrations.RenameField(
            model_name='leadpriority',
            old_name='level',
            new_name='order',
        ),

        # 3. lead_priorities: أضف created_at و updated_at
        migrations.AddField(
            model_name='leadpriority',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, db_index=True,
                                       default='2025-01-01 00:00:00+00:00'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='leadpriority',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),

        # 4. lead_statuses: أضف created_at و updated_at فقط (order موجودة)
        migrations.AddField(
            model_name='leadstatus',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, db_index=True,
                                       default='2025-01-01 00:00:00+00:00'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='leadstatus',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),

        # 5. leads: أضف الحقول الجديدة
        migrations.AddField(
            model_name='lead',
            name='won_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='lost_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='won_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='lead',
            name='lost_reason',
            field=models.TextField(blank=True, default=''),
        ),

        # 6. leads: أضف stage FK
        migrations.AddField(
            model_name='lead',
            name='stage',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='leads',
                to='leads.leadstage',
            ),
        ),

        # 7. الـ index موجود بالفعل في الـ DB — أخبر Django بكده بدون ما ينفذ SQL
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddIndex(
                    model_name='lead',
                    index=models.Index(
                        fields=['stage', 'assigned_to'],
                        name='leads_status__64a296_idx',
                    ),
                ),
            ],
        ),
    ]
