from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('leads', '0004_lead_stages_and_new_fields'),
    ]

    operations = [
        # أضف slug
        migrations.AddField(
            model_name='leadstage',
            name='slug',
            field=models.CharField(
                max_length=50,
                unique=False,        # بدون unique الأول عشان الـ table فاضية
                default='',
                choices=[
                    ('new',               'New'),
                    ('attempted_contact', 'Attempted Contact'),
                    ('contacted',         'Contacted'),
                    ('qualified',         'Qualified'),
                    ('interested',        'Interested'),
                    ('quotation_sent',    'Quotation Sent'),
                    ('negotiation',       'Negotiation'),
                    ('ready_to_close',    'Ready to Close'),
                    ('won',               'Won'),
                    ('lost',              'Lost'),
                ],
            ),
            preserve_default=False,
        ),
        # أضف is_closed
        migrations.AddField(
            model_name='leadstage',
            name='is_closed',
            field=models.BooleanField(default=False),
        ),
        # أضف is_won
        migrations.AddField(
            model_name='leadstage',
            name='is_won',
            field=models.BooleanField(default=False),
        ),
        # بعد الإضافة طبّق الـ unique على slug
        migrations.AlterField(
            model_name='leadstage',
            name='slug',
            field=models.CharField(
                max_length=50,
                unique=True,
                choices=[
                    ('new',               'New'),
                    ('attempted_contact', 'Attempted Contact'),
                    ('contacted',         'Contacted'),
                    ('qualified',         'Qualified'),
                    ('interested',        'Interested'),
                    ('quotation_sent',    'Quotation Sent'),
                    ('negotiation',       'Negotiation'),
                    ('ready_to_close',    'Ready to Close'),
                    ('won',               'Won'),
                    ('lost',              'Lost'),
                ],
            ),
        ),
        # احذف description لأنها مش في الـ model
        migrations.RemoveField(
            model_name='leadstage',
            name='description',
        ),
    ]
