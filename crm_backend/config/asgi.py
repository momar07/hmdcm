import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter
from apps.integrations.routing import jwt_router

application = ProtocolTypeRouter({
    'http': get_asgi_application(),
    'websocket': jwt_router,
})
