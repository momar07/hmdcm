from .services import log_action
from apps.common.utils import get_client_ip

LOGGED_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}


class AuditLogMiddleware:
    """
    Lightweight middleware that logs mutating API requests to AuditLog.
    Only logs authenticated requests to /api/ paths.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if (request.method in LOGGED_METHODS
                and request.path.startswith('/api/')
                and hasattr(request, 'user')
                and request.user.is_authenticated
                and response.status_code < 400):
            try:
                log_action(
                    user=request.user,
                    action=self._method_to_action(request.method),
                    model_name=request.path,
                    ip_address=get_client_ip(request),
                    user_agent=request.META.get('HTTP_USER_AGENT', ''),
                )
            except Exception:
                pass

        return response

    @staticmethod
    def _method_to_action(method: str) -> str:
        return {
            'POST':   'create',
            'PUT':    'update',
            'PATCH':  'update',
            'DELETE': 'delete',
        }.get(method, 'update')
