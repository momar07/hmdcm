from django.db import migrations

DEFAULT_SETTINGS = [
    # General
    ('company_name',          'My Call Center',             'general',       False),
    ('default_timezone',      'Africa/Cairo',               'general',       False),
    ('default_language',      'en',                         'general',       False),
    # Telephony
    ('ami_host',              '192.168.2.222',              'telephony',     False),
    ('ami_port',              '5038',                       'telephony',     False),
    ('ami_username',          'admin',                      'telephony',     False),
    ('ami_secret',            'admin',                      'telephony',     False),
    ('recording_base_url',    'http://192.168.2.222/recordings', 'telephony', False),
    # Security
    ('session_timeout_hours', '8',                          'security',      False),
    ('max_login_attempts',    '5',                          'security',      False),
    # Notifications
    ('notif_incoming_call',   'true',                       'notifications', True),
    ('notif_followup',        'true',                       'notifications', True),
    ('notif_campaign',        'true',                       'notifications', True),
    ('notif_lead_assign',     'true',                       'notifications', True),
]


def seed_settings(apps, schema_editor):
    SystemSetting = apps.get_model('settings_core', 'SystemSetting')
    for key, value, category, is_public in DEFAULT_SETTINGS:
        SystemSetting.objects.get_or_create(
            key=key,
            defaults={
                'value':       value,
                'category':    category,
                'is_public':   is_public,
                'description': '',
            },
        )


def unseed_settings(apps, schema_editor):
    pass   # leave rows in place on reverse migration


class Migration(migrations.Migration):
    dependencies = [
        ('settings_core', '0002_alter_systemsetting_options_and_more'),
    ]
    operations = [
        migrations.RunPython(seed_settings, unseed_settings),
    ]
