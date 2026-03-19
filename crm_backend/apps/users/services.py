from .models import User, Extension
from .selectors import get_user_by_id


def create_user(email, first_name, last_name, role, password, team=None, phone=''):
    user = User.objects.create_user(
        email=email, password=password,
        first_name=first_name, last_name=last_name,
        role=role, team=team, phone=phone,
    )
    return user


def update_user_status(user_id, status: str):
    User.objects.filter(pk=user_id).update(status=status)


def assign_extension(user_id, number: str, peer_name: str = '', secret: str = ''):
    user = get_user_by_id(user_id)
    ext, created = Extension.objects.update_or_create(
        user=user,
        defaults={'number': number, 'peer_name': peer_name, 'secret': secret}
    )
    return ext


# ── Queue / Agent Status via VICIdial API ────────────────────
def _vicidial_api(agent_user: str, function: str, value: str, extra: dict = None) -> tuple:
    """
    Send a command to the VICIdial Agent API (/agc/api.php).
    Returns (success: bool, response_text: str).
    """
    import requests as _requests
    from django.conf import settings
    import logging
    _log = logging.getLogger(__name__)

    base     = getattr(settings, 'VICIDIAL_URL',      '').rstrip('/')
    api_user = getattr(settings, 'VICIDIAL_API_USER', '6666')
    api_pass = getattr(settings, 'VICIDIAL_API_PASS', '1234')

    if not base:
        _log.warning('[VICIdial] VICIDIAL_URL not set in settings')
        return False, 'VICIDIAL_URL not configured'

    params = {
        'source':     'crm_dashboard',
        'user':       api_user,
        'pass':       api_pass,
        'agent_user': agent_user,
        'function':   function,
        'value':      value,
    }
    if extra:
        params.update(extra)

    try:
        r = _requests.get(
            f'{base}/agc/api.php',
            params=params,
            timeout=5,
        )
        text = r.text.strip()
        ok   = 'SUCCESS' in text
        _log.info(f'[VICIdial API] {function}({value}) agent={agent_user} → {text}')
        return ok, text
    except Exception as e:
        _log.error(f'[VICIdial API] Error: {e}')
        return False, str(e)



def _vicidial_db_ready(agent_user: str) -> bool:
    """
    Directly update vicidial_live_agents in MySQL to set agent READY.
    Used because external_pause RESUME does not override LOGIN pause code.
    """
    import pymysql
    from django.conf import settings
    import logging
    _log = logging.getLogger(__name__)

    try:
        conn = pymysql.connect(
            host   = getattr(settings, 'VICIDIAL_DB_HOST', '192.168.2.110'),
            port   = getattr(settings, 'VICIDIAL_DB_PORT', 3306),
            user   = getattr(settings, 'VICIDIAL_DB_USER', 'cron'),
            passwd = getattr(settings, 'VICIDIAL_DB_PASS', '1234'),
            db     = getattr(settings, 'VICIDIAL_DB_NAME', 'asterisk'),
            connect_timeout = 5,
        )
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE vicidial_live_agents "
                "SET status='READY', pause_code='' "
                "WHERE user=%s AND status='PAUSED'",
                (agent_user,)
            )
        conn.commit()
        conn.close()
        _log.info(f'[VICIdial DB] Agent {agent_user} set READY — rows updated: {rows}')
        return rows > 0
    except Exception as e:
        _log.error(f'[VICIdial DB] Error setting READY for {agent_user}: {e}')
        return False

def agent_queue_login(user) -> bool:
    """
    Make agent Available:
    1. Build vicidial.php URL and return it (frontend will open hidden iframe)
    2. After session is ready, call external_pause RESUME
    """
    from .models import Extension
    import logging
    _log = logging.getLogger(__name__)

    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        _log.warning(f'[Login] No active extension for {user.email}')
        update_user_status(str(user.id), 'available')
        _notify_status_change(user, 'available')
        return True

    agent_num = ext.vicidial_user or ext.number

    # Step 1: API RESUME
    ok, msg = _vicidial_api(agent_num, 'external_pause', 'RESUME')
    _log.info(f'[Login] external_pause RESUME → {msg}')

    # Step 2: Direct DB update to override LOGIN pause code
    db_ok = _vicidial_db_ready(agent_num)
    _log.info(f'[Login] DB READY update → {db_ok}')

    update_user_status(str(user.id), 'available')
    _notify_status_change(user, 'available')
    _log.info(f'[Login] Agent {user.email} is now AVAILABLE')

    return ok or db_ok


def agent_queue_pause(user, reason: str = 'Break') -> bool:
    """Put agent on Break via VICIdial API."""
    from .models import Extension
    import logging
    _log = logging.getLogger(__name__)

    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        update_user_status(str(user.id), 'away')
        _notify_status_change(user, 'away')
        return True

    agent_num = ext.vicidial_user or ext.number

    # First pause the agent
    ok, msg = _vicidial_api(agent_num, 'external_pause', 'PAUSE')

    # Then set the pause code reason
    if ok:
        _vicidial_api(agent_num, 'pause_code', reason.upper())

    update_user_status(str(user.id), 'away')
    _notify_status_change(user, 'away')
    _log.info(f'[Break] Agent {user.email} paused — reason: {reason}')
    return ok


def agent_queue_logoff(user) -> bool:
    """Logout agent from VICIdial."""
    from .models import Extension
    import logging
    _log = logging.getLogger(__name__)

    try:
        ext = Extension.objects.get(user=user, is_active=True)
    except Extension.DoesNotExist:
        update_user_status(str(user.id), 'offline')
        _notify_status_change(user, 'offline')
        return True

    agent_num = ext.vicidial_user or ext.number

    ok, msg = _vicidial_api(agent_num, 'logout', 'LOGOUT')

    update_user_status(str(user.id), 'offline')
    _notify_status_change(user, 'offline')
    _log.info(f'[Logoff] Agent {user.email} logged off')
    return ok


def _notify_status_change(user, new_status: str):
    """Push status update to supervisors via WebSocket."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {
                'type': 'agent_status_update',
                'payload': {
                    'agent_id':   str(user.id),
                    'agent_name': user.get_full_name(),
                    'status':     new_status,
                    'extension':  getattr(getattr(user, 'extension', None), 'number', None),
                }
            }
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f'[WS Notify] {e}')
