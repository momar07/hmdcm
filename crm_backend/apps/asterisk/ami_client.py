import socket
import time
import logging
import threading
from django.conf import settings

logger = logging.getLogger(__name__)

RECONNECT_DELAY = 10   # seconds between reconnect attempts
BUFFER_SIZE     = 4096


class AMIClient:
    """
    Persistent AMI TCP connection.
    Reads events in a loop and dispatches them to Celery tasks.
    """

    def __init__(self):
        self.host     = settings.AMI_HOST
        self.port     = settings.AMI_PORT
        self.username = settings.AMI_USERNAME
        self.secret   = settings.AMI_SECRET
        self.sock     = None
        self._running = False
        self._lock    = threading.Lock()

    # ── connection ────────────────────────────────────────────

    def _connect(self) -> bool:
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(30)
            self.sock.connect((self.host, self.port))

            # read banner
            self.sock.recv(100)

            # login
            self._send(
                f'Action: Login\r\n'
                f'Username: {self.username}\r\n'
                f'Secret: {self.secret}\r\n'
                f'Events: on\r\n'
                f'\r\n'
            )
            time.sleep(1)
            resp = self.sock.recv(BUFFER_SIZE).decode('utf-8', errors='ignore')

            if 'Success' in resp:
                logger.info('[AMI] Connected and authenticated ✅')
                return True
            else:
                logger.error(f'[AMI] Auth failed: {resp}')
                return False

        except Exception as e:
            logger.error(f'[AMI] Connection error: {e}')
            return False

    def _send(self, msg: str):
        if self.sock:
            self.sock.sendall(msg.encode('utf-8'))

    def _disconnect(self):
        try:
            if self.sock:
                self._send('Action: Logoff\r\n\r\n')
                self.sock.close()
        except Exception:
            pass
        self.sock = None

    # ── event parsing ─────────────────────────────────────────

    @staticmethod
    def _parse_event(raw: str) -> dict:
        """Parse a raw AMI event block into a dict."""
        event = {}
        for line in raw.strip().splitlines():
            if ': ' in line:
                key, _, val = line.partition(': ')
                event[key.strip()] = val.strip()
        return event

    # ── main loop ─────────────────────────────────────────────

    def run(self):
        """
        Main blocking loop — call this from a Celery task or thread.
        Reconnects automatically on disconnect.
        """
        self._running = True
        buffer = ''

        while self._running:
            if not self._connect():
                logger.warning(f'[AMI] Retrying in {RECONNECT_DELAY}s...')
                time.sleep(RECONNECT_DELAY)
                continue

            try:
                while self._running:
                    try:
                        chunk = self.sock.recv(BUFFER_SIZE).decode('utf-8', errors='ignore')
                        if not chunk:
                            logger.warning('[AMI] Connection closed by server')
                            break
                        buffer += chunk

                        # events are separated by double CRLF
                        while '\r\n\r\n' in buffer:
                            block, buffer = buffer.split('\r\n\r\n', 1)
                            event = self._parse_event(block)
                            if event.get('Event'):
                                self._dispatch(event)

                    except socket.timeout:
                        # send keepalive ping
                        self._send('Action: Ping\r\n\r\n')
                        continue

            except Exception as e:
                logger.error(f'[AMI] Loop error: {e}')

            finally:
                self._disconnect()
                if self._running:
                    logger.info(f'[AMI] Reconnecting in {RECONNECT_DELAY}s...')
                    time.sleep(RECONNECT_DELAY)

    def stop(self):
        self._running = False
        self._disconnect()

    # ── dispatch ──────────────────────────────────────────────

    @staticmethod
    def _dispatch(event: dict):
        """Send relevant events to the Celery task."""
        relevant = {
            'Newchannel', 'Bridge', 'Hangup', 'SoftHangupRequest', 'Dial',
            'AgentLogin', 'AgentLogoff', 'AgentCalled',
            'AgentConnect', 'AgentComplete', 'AgentRinghangup',
            'QueueMemberAdded', 'QueueMemberRemoved',
            'QueueMemberPause', 'QueueMemberStatus',
        }
        name = event.get('Event', '')

        if name in relevant:
            logger.debug(f'[AMI] Dispatching: {name} — {event.get("Uniqueid")}')
            try:
                from apps.calls.tasks import process_ami_event
                # apply directly in the same process (no celery worker needed)
                process_ami_event.apply(args=[event])
            except Exception as e:
                logger.error(f'[AMI] Dispatch error: {e}')
