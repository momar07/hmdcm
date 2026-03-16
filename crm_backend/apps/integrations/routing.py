from django.urls import re_path
from .middleware import JWTAuthMiddleware
from .consumers import CallEventConsumer

websocket_urlpatterns = [
    re_path(r'ws/calls/$', CallEventConsumer.as_asgi()),
]

# Wrap the whole router with JWT middleware
from channels.routing import URLRouter
jwt_router = JWTAuthMiddleware(URLRouter(websocket_urlpatterns))
