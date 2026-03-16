from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _get_user_from_token(token_key: str):
    """Validate JWT access token and return User instance."""
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from apps.users.models import User
        token = AccessToken(token_key)
        return User.objects.get(pk=token['user_id'])
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware:
    """
    ASGI middleware that reads ?token=<jwt> from the WebSocket URL
    and populates scope['user'].
    """
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        params       = parse_qs(query_string)
        token_list   = params.get('token', [])

        if token_list:
            scope['user'] = await _get_user_from_token(token_list[0])
        else:
            scope['user'] = AnonymousUser()

        return await self.inner(scope, receive, send)
