"""
Thread-local storage for the current request user.

Used by signals & services that need to know who triggered an action
(e.g. auto-linking calls to tickets/approvals when the user is on a call).
"""
import threading

_storage = threading.local()


def set_current_user(user):
    """Called by middleware at the start of each request."""
    _storage.user = user


def get_current_user():
    """Returns the user of the current request, or None outside a request."""
    return getattr(_storage, 'user', None)


def clear_current_user():
    """Called by middleware after the response is sent."""
    if hasattr(_storage, 'user'):
        del _storage.user
