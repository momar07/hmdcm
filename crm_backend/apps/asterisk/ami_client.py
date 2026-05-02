import socket
import time
import logging
import threading
from django.conf import settings

logger = logging.getLogger(__name__)

RECONNECT_DELAY = 10     # seconds between reconnect attempts
MAX_RECONNECT_DELAY = 120  # cap for exponential backoff
BUFFER_SIZE     = 4096
PING_INTERVAL   = 30     # seconds between keepalive pings


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
        self._reconnect_count = 0  # FIX #6: track reconnect attempts for backoff

    # ── connection ────────────────────────────────────────────

    def _connect(self) -> bool:
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
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
                self._reconnect_count = 0  # FIX #6: reset on successful connect
                logger.info('[AMI] Connected and authenticated')
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
        Reconnects automatically on disconnect with exponential backoff.
        """
        self._running = True
        buffer = ''
        last_ping = 0

        while self._running:
            if not self._connect():
                # FIX #6: exponential backoff with jitter
                self._reconnect_count += 1
                delay = min(
                    RECONNECT_DELAY * (2 ** min(self._reconnect_count - 1, 6)),
                    MAX_RECONNECT_DELAY,
                )
                logger.warning(f'[AMI] Retrying in {delay}s (attempt {self._reconnect_count})...')
                time.sleep(delay)
                continue

            try:
                while self._running:
                    try:
                        chunk = self.sock.recv(BUFFER_SIZE).decode('utf-8', errors='ignore')
                        if not chunk:
                            logger.warning('[AMI] Connection closed by server')
                            break
                        buffer += chunk
                        last_ping = time.time()  # reset ping timer on any data

                        # events are separated by double CRLF
                        while '\r\n\r\n' in buffer:
                            block, buffer = buffer.split('\r\n\r\n', 1)
                            event = self._parse_event(block)
                            if event.get('Event'):
                                self._dispatch(event)

                    except socket.timeout:
                        # FIX #6: send keepalive ping on timeout
                        self._send('Action: Ping\r\n\r\n')
                        last_ping = time.time()
                        continue

            except Exception as e:
                logger.error(f'[AMI] Loop error: {e}')

            finally:
                self._disconnect()
                if self._running:
                    # FIX #6: exponential backoff on disconnect too
                    self._reconnect_count += 1
                    delay = min(
                        RECONNECT_DELAY * (2 ** min(self._reconnect_count - 1, 6)),
                        MAX_RECONNECT_DELAY,
                    )
                    logger.info(f'[AMI] Reconnecting in {delay}s...')
                    time.sleep(delay)

    def stop(self):
        self._running = False
        self._reconnect_count = 0
        self._disconnect()

    # ── dispatch ──────────────────────────────────────────────

    @staticmethod
    def _dispatch(event: dict):
        """Send relevant events to the Celery task."""
        relevant = {
            # Call events
            'Newchannel', 'Bridge', 'Hangup', 'SoftHangupRequest', 'Dial',
            # Queue caller events
            'QueueCallerJoin', 'QueueCallerLeave',
            # Queue member events
            'QueueMemberAdded', 'QueueMemberRemoved',
            'QueueMemberPaused',
            'QueueMemberStatus',
            # Agent events
            'AgentLogin', 'AgentLogoff',
            'AgentCalled',
            'AgentConnect', 'AgentComplete', 'AgentRinghangup',
        }
        name = event.get('Event', '')

        if name in relevant:
            import sys
            print(f'[AMI DEBUG] Dispatching: {name} uid={event.get("Uniqueid")}', flush=True)
            sys.stdout.flush()
            try:
                from apps.calls.tasks import process_ami_event
                result = process_ami_event.apply(args=[event])
                print(f'[AMI DEBUG] Task result: {result.status} — {result.result}', flush=True)
                if result.traceback:
                    print(f'[AMI DEBUG] TRACEBACK: {result.traceback}', flush=True)
            except Exception as e:
                import traceback
                print(f'[AMI DEBUG] Dispatch error: {e}', flush=True)
                traceback.print_exc()
