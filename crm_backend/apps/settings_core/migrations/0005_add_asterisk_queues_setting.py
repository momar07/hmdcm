from django.db import migrations


def add_queue_settings(apps, schema_editor):
    SystemSetting = apps.get_model('settings_core', 'SystemSetting')
    rows = [
        ('asterisk_queues',         '[]',  'telephony', False,
         'JSON array of Asterisk queue names e.g. ["600","601"]'),
        ('asterisk_queue_penalty',  '0',   'telephony', False,
         'Default penalty for agents added to queues (0 = highest priority)'),
    ]
    for key, value, category, is_public, description in rows:
        SystemSetting.objects.get_or_create(
            key=key,
            defaults={
                'value':       value,
                'category':    category,
                'is_public':   is_public,
                'description': description,
            },
        )


def remove_queue_settings(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('settings_core', '0004_merge_20260323_0822'),
    ]
    operations = [
        migrations.RunPython(add_queue_settings, remove_queue_settings),
    ]
