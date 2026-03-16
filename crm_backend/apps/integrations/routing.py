from django.urls import re_path
from .middleware import JWTAuthMiddleware
from .consumers import CallEventConsumer

websocket_urlpatterns = [
    re_path(r'^ws/calls/$', JWTAuthMiddleware(CallEventConsumer.as_asgi())),
]
