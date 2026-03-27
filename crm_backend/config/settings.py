import os
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

SECRET_KEY = env('SECRET_KEY', default='dev-secret-key')
DEBUG = env.bool('DEBUG', default=False)
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['*'])

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'channels',
    'drf_spectacular',
    'django_celery_beat',
    'django_celery_results',
    # Internal apps
    'apps.common',
    'apps.accounts',
    'apps.users',
    'apps.teams',
    'apps.customers',
    'apps.leads',
    'apps.calls',
    'apps.followups',
    'apps.tickets',
    'apps.notes',
    'apps.campaigns',
    'apps.reports',
    'apps.integrations',
    'apps.settings_core',
    'apps.dashboard',
    'apps.tasks',
    'apps.approvals',
    'apps.sales',
    'apps.auditlog',
    'apps.asterisk',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.auditlog.middleware.AuditLogMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [BASE_DIR / 'templates'],
    'APP_DIRS': True,
    'OPTIONS': {
        'context_processors': [
            'django.template.context_processors.debug',
            'django.template.context_processors.request',
            'django.contrib.auth.context_processors.auth',
            'django.contrib.messages.context_processors.messages',
        ],
    },
}]

DATABASES = {
    'default': env.db('DATABASE_URL', default='postgres://crm_user:crm_pass@localhost:5432/crm_db')
}

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': env('REDIS_URL', default='redis://localhost:6379/0'),
        'OPTIONS': {'CLIENT_CLASS': 'django_redis.client.DefaultClient'},
    }
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [env('REDIS_URL', default='redis://localhost:6379/0')]},
    }
}

CELERY_BROKER_URL = env('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.common.pagination.StandardResultsPagination',
    'PAGE_SIZE': 25,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Call Center CRM API',
    'DESCRIPTION': 'Production-grade CRM integrated with Issabel PBX',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

AUTH_USER_MODEL = 'users.User'

CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=['http://localhost:3000'])
CORS_ALLOW_CREDENTIALS = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Asterisk / Issabel settings

# VICIdial integration
VICIDIAL_URL      = env('VICIDIAL_URL',      default='')   # e.g. http://192.168.2.XXX
VICIDIAL_API_USER = env('VICIDIAL_API_USER', default='6666')
VICIDIAL_API_PASS = env('VICIDIAL_API_PASS', default='1234')
VICIDIAL_CAMPAIGN = env('VICIDIAL_CAMPAIGN', default='2000')
VICIDIAL_INGROUP  = env('VICIDIAL_INGROUP',  default='901')

AMI_HOST = env('AMI_HOST', default='127.0.0.1')
AMI_PORT = env.int('AMI_PORT', default=5038)
AMI_USERNAME = env('AMI_USERNAME', default='admin')
AMI_SECRET = env('AMI_SECRET', default='secret')
RECORDING_BASE_PATH = env('RECORDING_BASE_PATH', default='/var/spool/asterisk/monitor')
RECORDING_BASE_URL = env('RECORDING_BASE_URL', default='http://localhost/recordings')

# ── VICIdial MySQL Direct ──────────────────────────────────
VICIDIAL_DB_HOST = env('VICIDIAL_DB_HOST', default='192.168.2.222')
VICIDIAL_DB_PORT = env.int('VICIDIAL_DB_PORT', default=3306)
VICIDIAL_DB_NAME = env('VICIDIAL_DB_NAME', default='asterisk')
VICIDIAL_DB_USER = env('VICIDIAL_DB_USER', default='cron')
VICIDIAL_DB_PASS = env('VICIDIAL_DB_PASS', default='1234')


# ── Tickets SLA & automation tasks ───────────────────────────────
CELERY_BEAT_SCHEDULE_TICKETS = {
    "check-sla-breaches": {
        "task":     "apps.tickets.tasks.check_sla_breaches",
        "schedule": 300,          # every 5 minutes
    },
    "auto-close-resolved": {
        "task":     "apps.tickets.tasks.auto_close_resolved_tickets",
        "schedule": 86400,        # every 24 hours
    },
    "notify-escalated": {
        "task":     "apps.tickets.tasks.notify_escalated_tickets",
        "schedule": 1800,         # every 30 minutes
    },
}

# Merge into main beat schedule if it exists
if "CELERY_BEAT_SCHEDULE" not in dir():
    CELERY_BEAT_SCHEDULE = {
    'send-task-reminders': {
        'task':     'apps.tasks.tasks.send_task_reminders',
        'schedule': 60.0,  # every 60 seconds
    },}
CELERY_BEAT_SCHEDULE.update(CELERY_BEAT_SCHEDULE_TICKETS)
CELERY_BEAT_SCHEDULE["expire-overdue-quotations"] = {
    "task":     "apps.sales.tasks.expire_overdue_quotations",
    "schedule": 3600,   # every hour
}

# Timezone
TIME_ZONE = 'Africa/Cairo'
USE_TZ    = False
