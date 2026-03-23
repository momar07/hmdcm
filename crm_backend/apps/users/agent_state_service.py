"""
Agent State Service — Issabel/Asterisk AMI (PJSIP)
Manages agent availability across all configured queues.

Queues are read from the Queue model (managed via Settings page).
AMI connection reuses settings from SystemSetting (ami_host, ami_port, etc.)
"""
import json
import logging
import socket
import threading
import time

from apps.users.services import update_user_status

log = logging.getLogger(__name__)


# ── AMI low-level client ─────────────────────────────────────────────────────

class AmiClient:
    """Minimal synchronous AMI client for queue management commands."""

    def __init__(self, host: str, port: int, username: str, secret: str, timeout: int = 5):
        self.host     = host
        self.port     = port
        self.username = username
        self.secret   = secret
        self.timeout  = timeout
        self._sock    = None

    def connect(self):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.settimeout(self.timeout)
        self._sock.connect((self.host, self.port))
        banner = self._recv()
        log.debug(f'[AMI] connected — {banner.strip()}')

    def login(self):
        self._send(
            f'Action: Login\r\n'
            f'Username: {self.username}\r\n'
            f'Secret: {self.secret}\r\n'
            f'\r\n'
        )
        resp = self._recv()
        if 'Success' not in resp:
            raise ConnectionError(f'AMI login failed: {resp}')
        log.debug('[AMI] logged in')

    def send_action(self, action: str, fields: dict) -> str:
        """Send an AMI action and return the raw response."""
        msg = f'Action: {action}\r\n'
        for k, v in fields.items():
            msg += f'{k}: {v}\r\n'
        msg += '\r\n'
        self._send(msg)
        return self._recv()

    def logoff(self):
        try:
            self._send('Action: Logoff\r\n\r\n')
        except Exception:
            pass
        finally:
            try:
                self._sock.close()
            except Exception:
                pass

    def _send(self, msg: str):
        self._sock.sendall(msg.encode())

    def _recv(self) -> str:
        chunks = []
        self._sock.settimeout(self.timeout)
        try:
            while True:
                chunk = self._sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk.decode(errors='replace'))
                if b'\r\n\r\n' in chunk or b'\n\n' in chunk:
                    break
        except socket.timeout:
            pass
        return ''.join(chunks)


# ── Config helpers ────────────────────────────────────────────────────────────

def _get_ami_client() -> AmiClient:
    """Build AmiClient from SystemSetting rows."""
    from apps.settings_core.models import SystemSetting

    def _s(key, default):
        try:
            return SystemSetting.objects.get(key=key).value
        except SystemSetting.DoesNotExist:
            return default

    return AmiClient(
        host     = _s('ami_host',     '127.0.0.1'),
        port     = int(_s('ami_port', '5038')),
        username = _s('ami_username', 'admin'),
        secret   = _s('ami_secret',   'admin'),
    )


def _get_queues(user=None) -> list[str]:
    """
    Return queue names for a specific user (from their extension's queues M2M).
    Falls back to all active queues if user has no extension or no queues assigned.
    """
    from apps.users.models import Queue
    if user is not None:
        ext = getattr(user, 'extension', None)
        if ext and ext.is_active:
            user_queues = list(ext.queues.filter(is_active=True).values_list('name', flat=True))
            if user_queues:
                return user_queues
    # Fallback: no queues assigned — return empty (CRM-only status update)
    return []


def _get_interface(user) -> str | None:
    """Return PJSIP/peer_name for the user's extension, or None."""
    ext = getattr(user, 'extension', None)
    if not ext or not ext.is_active:
        return None
    peer = ext.peer_name.strip() if ext.peer_name else ext.number
    return f'PJSIP/{peer}'


def _run_ami(actions: list[tuple[str, dict]]) -> list[str]:
    """
    Connect to AMI, run a list of (action_name, fields) tuples,
    disconnect, and return responses.
    """
    client = _get_ami_client()
    responses = []
    try:
        client.connect()
        client.login()
        for action, fields in actions:
            resp = client.send_action(action, fields)
            log.info(f'[AMI] {action} {fields} → {resp.strip()[:120]}')
            responses.append(resp)
            time.sleep(0.1)   # small gap between commands
    except Exception as e:
        log.error(f'[AMI] Error: {e}')
        responses.append(str(e))
    finally:
        client.logoff()
    return responses


# ── Public service functions ─────────────────────────────────────────────────

def agent_go_available(user) -> dict:
    """
    Add agent to all active queues and unpause them.
    Returns { success, status, queues, message }
    """
    interface = _get_interface(user)
    queues    = _get_queues(user)

    if not interface:
        log.warning(f'[AgentState] No active extension for {user.email}')
        update_user_status(str(user.id), 'available')
        _notify(user, 'available')
        return {'success': True, 'status': 'available', 'queues': [], 'message': 'No extension — CRM status updated only'}

    if not queues:
        log.warning('[AgentState] No active queues configured')
        update_user_status(str(user.id), 'available')
        _notify(user, 'available')
        return {'success': True, 'status': 'available', 'queues': [], 'message': 'No queues configured — CRM status updated only'}

    ext        = user.extension
    member     = user.get_full_name() or interface
    penalty    = '0'

    actions = []
    for q in queues:
        actions.append(('QueueAdd', {
            'Queue':      q,
            'Interface':  interface,
            'MemberName': member,
            'Penalty':    penalty,
            'Paused':     'false',
        }))
        # Unpause in case agent was previously paused
        actions.append(('QueuePause', {
            'Queue':     q,
            'Interface': interface,
            'Paused':    'false',
        }))

    responses = _run_ami(actions)
    update_user_status(str(user.id), 'available')
    _notify(user, 'available')

    # Close any open break record
    from apps.users.models import AgentBreak
    from django.utils import timezone
    AgentBreak.objects.filter(
        agent=user, break_end__isnull=True
    ).update(break_end=timezone.now())

    log.info(f'[AgentState] {user.email} → available across queues: {queues}')
    return {'success': True, 'status': 'available', 'queues': queues, 'message': f'Added to queues: {", ".join(queues)}'}


def agent_go_break(user, reason: str = 'Break') -> dict:
    """
    Pause agent in all active queues.
    Returns { success, status, queues, message }
    """
    interface = _get_interface(user)
    queues    = _get_queues(user)

    if not interface or not queues:
        update_user_status(str(user.id), 'away')
        _notify(user, 'away')
        return {'success': True, 'status': 'away', 'queues': [], 'message': 'CRM status updated only'}

    actions = [
        ('QueuePause', {
            'Queue':     q,
            'Interface': interface,
            'Paused':    'true',
            'Reason':    reason,
        })
        for q in queues
    ]

    _run_ami(actions)
    update_user_status(str(user.id), 'away')
    _notify(user, 'away')

    # Create break record linked to active session
    from apps.users.models import AgentBreak, AgentSession
    active_session = AgentSession.objects.filter(
        agent=user, logout_at__isnull=True
    ).order_by('-login_at').first()
    AgentBreak.objects.create(
        session = active_session,
        agent   = user,
        reason  = reason,
    )

    log.info(f'[AgentState] {user.email} → break ({reason}) across queues: {queues}')
    return {'success': True, 'status': 'away', 'queues': queues, 'message': f'Paused in queues: {", ".join(queues)}'}


def agent_go_offline(user) -> dict:
    """
    Remove agent from all active queues.
    Returns { success, status, queues, message }
    """
    interface = _get_interface(user)
    queues    = _get_queues(user)

    if not interface or not queues:
        update_user_status(str(user.id), 'offline')
        _notify(user, 'offline')
        return {'success': True, 'status': 'offline', 'queues': [], 'message': 'CRM status updated only'}

    actions = [
        ('QueueRemove', {
            'Queue':     q,
            'Interface': interface,
        })
        for q in queues
    ]

    _run_ami(actions)
    update_user_status(str(user.id), 'offline')
    _notify(user, 'offline')

    log.info(f'[AgentState] {user.email} → offline, removed from queues: {queues}')
    return {'success': True, 'status': 'offline', 'queues': queues, 'message': f'Removed from queues: {", ".join(queues)}'}


def agent_sync_status(user) -> dict:
    """
    Query Issabel QueueStatus for this agent and sync CRM DB.
    Returns { success, status, message }
    """
    interface = _get_interface(user)
    queues    = _get_queues(user)

    if not interface:
        return {'success': False, 'status': user.status, 'message': 'No extension assigned'}

    # Use first queue for status check
    queue = queues[0] if queues else None
    fields = {'Interface': interface}
    if queue:
        fields['Queue'] = queue

    responses = _run_ami([('QueueStatus', fields)])
    raw = ' '.join(responses)

    # Parse Paused and InCall flags from AMI response
    paused  = 'Paused: 1' in raw
    in_call = 'Status: 1' in raw or 'Status: 2' in raw   # 1=not_in_use, 2=in_use

    if 'in_use' in raw.lower() or 'Status: 2' in raw:
        mapped = 'on_call'
    elif paused:
        mapped = 'away'
    elif 'not_in_use' in raw.lower() or 'Status: 1' in raw:
        mapped = 'available'
    else:
        mapped = 'offline'

    update_user_status(str(user.id), mapped)
    _notify(user, mapped)

    log.info(f'[AgentState] sync {user.email} → {mapped}')
    return {'success': True, 'status': mapped, 'message': f'Synced from Issabel: {mapped}'}




# ── Login / Logout sequences ─────────────────────────────────────────────────

def _do_unpause(user_id: str, session_id: str):
    """
    Runs in a background thread 5 seconds after login.
    Unpauses agent in all queues and sets status to available.
    """
    try:
        import django
        from django.apps import apps as django_apps
        # Ensure Django is set up (needed for threads)
        if not django_apps.ready:
            django.setup()

        from apps.users.models import User, AgentBreak
        from apps.users.services import update_user_status
        from django.utils import timezone

        user      = User.objects.select_related('extension').get(pk=user_id)
        interface = _get_interface(user)
        queues    = _get_queues(user)

        # Close the LOGIN break
        AgentBreak.objects.filter(
            agent_id  = user_id,
            reason    = 'LOGIN',
            break_end__isnull = True,
        ).update(break_end=timezone.now())

        # Unpause in Asterisk
        if interface and queues:
            actions = [
                ('QueuePause', {
                    'Queue':     q,
                    'Interface': interface,
                    'Paused':    'false',
                })
                for q in queues
            ]
            _run_ami(actions)
            log.info(f'[LoginSeq] {user.email} unpaused in queues: {queues}')

        # Update CRM status
        update_user_status(user_id, 'available')
        _notify(user, 'available')
        log.info(f'[LoginSeq] {user.email} → available (login sequence complete)')

    except Exception as e:
        log.error(f'[LoginSeq] _do_unpause error for user {user_id}: {e}')


def agent_on_login(user, request=None) -> dict:
    """
    Full login sequence:
    1. Check if agent is already in queues → remove if so
    2. QueueAdd to all assigned queues
    3. QueuePause (LOGIN break, 5s)
    4. Create AgentSession record
    5. Create AgentBreak (LOGIN) record
    6. Fire Celery task to unpause after 5s
    Returns immediately — unpause happens in background.
    """
    from apps.users.models import AgentSession, AgentBreak
    from apps.users.services import update_user_status

    interface = _get_interface(user)
    queues    = _get_queues(user)

    # Get login IP if request provided
    login_ip = None
    if request:
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        login_ip    = x_forwarded.split(',')[0] if x_forwarded else request.META.get('REMOTE_ADDR')

    # Create session record
    session = AgentSession.objects.create(
        agent    = user,
        login_ip = login_ip,
    )
    log.info(f'[Login] Session created for {user.email} — id={session.id}')

    if not interface or not queues:
        # No extension or no queues — CRM-only login
        update_user_status(str(user.id), 'available')
        _notify(user, 'available')
        log.info(f'[Login] {user.email} — no extension/queues, CRM-only available')
        return {
            'success':    True,
            'status':     'available',
            'session_id': str(session.id),
            'message':    'Logged in (no queues assigned)',
        }

    # Step 1: Remove from queues if already member (clean slate)
    remove_actions = [('QueueRemove', {'Queue': q, 'Interface': interface}) for q in queues]
    _run_ami(remove_actions)
    log.info(f'[Login] {user.email} — removed from queues (clean slate)')

    # Step 2: Add to all queues already paused — atomic, no race condition window
    member      = user.get_full_name() or interface
    add_actions = [
        ('QueueAdd', {
            'Queue':      q,
            'Interface':  interface,
            'MemberName': member,
            'Penalty':    '0',
            'Paused':     'true',   # joined already paused
        })
        for q in queues
    ]
    _run_ami(add_actions)
    log.info(f'[Login] {user.email} — added to queues paused: {queues}')

    # Step 3: Create LOGIN break record
    AgentBreak.objects.create(
        session = session,
        agent   = user,
        reason  = 'LOGIN',
    )

    # Step 4: Update CRM status to away (LOGIN break)
    update_user_status(str(user.id), 'away')
    _notify(user, 'away')

    # Step 5: Fire background thread — will unpause after 5 seconds
    t = threading.Timer(5.0, _do_unpause, args=[str(user.id), str(session.id)])
    t.daemon = True   # won't block server shutdown
    t.start()
    log.info(f'[Login] {user.email} — added paused, will unpause in 5s via threading.Timer')

    return {
        'success':    True,
        'status':     'away',
        'session_id': str(session.id),
        'message':    'Login sequence started — will be available in 5 seconds',
    }


def agent_on_logout(user) -> dict:
    """
    Full logout sequence:
    1. If on break → close break record
    2. QueueRemove from all queues
    3. Close active AgentSession
    4. Set CRM status offline
    """
    from apps.users.models import AgentSession, AgentBreak
    from apps.users.services import update_user_status
    from django.utils import timezone

    interface = _get_interface(user)
    queues    = _get_queues(user)

    # Close any open break records
    now = timezone.now()
    AgentBreak.objects.filter(
        agent=user,
        break_end__isnull=True,
    ).update(break_end=now)

    # Remove from all queues
    if interface and queues:
        remove_actions = [('QueueRemove', {'Queue': q, 'Interface': interface}) for q in queues]
        _run_ami(remove_actions)
        log.info(f'[Logout] {user.email} removed from queues: {queues}')

    # Close active session
    AgentSession.objects.filter(
        agent=user,
        logout_at__isnull=True,
    ).update(logout_at=now)

    update_user_status(str(user.id), 'offline')
    _notify(user, 'offline')
    log.info(f'[Logout] {user.email} → offline, session closed')

    return {
        'success': True,
        'status':  'offline',
        'message': 'Logged out and removed from all queues',
    }

# ── Internal helpers ─────────────────────────────────────────────────────────

def _notify(user, new_status: str):
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
        log.error(f'[AgentState] WebSocket notify error: {e}')
