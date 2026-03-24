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

# ── Followup Reminder Scheduler (no Celery beat needed) ─────────────
import threading

def _start_reminder_scheduler():
    """Run send_followup_reminders every 5 minutes in a background thread."""
    import importlib
    def _tick():
        try:
            mod = importlib.import_module('apps.calls.tasks')
            mod.send_followup_reminders.apply()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'[Reminder] Tick error: {e}')
        # Reschedule
        t = threading.Timer(300, _tick)   # 300s = 5 minutes
        t.daemon = True
        t.start()

    # First run after 60s (let Django finish startup)
    t = threading.Timer(60, _tick)
    t.daemon = True
    t.start()

_start_reminder_scheduler()
