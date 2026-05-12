from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == 'admin')


class IsSupervisor(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role in ('admin', 'supervisor'))


class IsAgent(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role in ('admin', 'supervisor', 'agent'))


class IsAdminOrSupervisor(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role in ('admin', 'supervisor'))


from rest_framework.permissions import BasePermission


class IsSupervisorOrAdmin(BasePermission):
    """Allows access only to users with role in ('supervisor', 'admin')."""
    message = "Only supervisors or admins can perform this action."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        return getattr(user, "role", None) in ("supervisor", "admin")
