import logging
from django.conf import settings
from apps.common.exceptions import IntegrationException

logger = logging.getLogger(__name__)


# ─── AMI Connection ──────────────────────────────────────────────────────────

def connect_ami():
    """
    Returns a connected panoramisk AMI Manager instance.
    Use in async contexts (Channels) or wrap with asyncio.run() in sync code.
    """
    try:
        import panoramisk
        manager = panoramisk.Manager(
            host=settings.AMI_HOST,
            port=settings.AMI_PORT,
            username=settings.AMI_USERNAME,
            secret=settings.AMI_SECRET,
        )
        return manager
    except Exception as exc:
        logger.error(f'AMI connect_ami() failed: {exc}')
        raise IntegrationException(f'AMI connection error: {exc}')


# ─── Originate Call (Click-to-Call) ──────────────────────────────────────────

def originate_call(agent, phone_number: str, customer_id=None) -> dict:
    """
    Trigger an outbound call:
      1. Agent extension rings.
      2. When agent picks up, the destination number is dialled.
    """
    try:
        ext = agent.extension.number
    except Exception:
        raise IntegrationException('Agent has no SIP extension assigned.')

    action_payload = {
        'Action':   'Originate',
        'Channel':  f'SIP/{ext}',
        'Exten':    phone_number,
        'Context':  'from-internal',
        'Priority': '1',
        'CallerID': f'CRM <{ext}>',
        'Timeout':  '30000',
        'Async':    'true',
        'Variable': f'CRM_CUSTOMER_ID={customer_id or ""},'
                    f'CRM_AGENT_ID={agent.id}',
    }

    logger.info(
        f'[AMI Originate] agent_ext={ext} -> destination={phone_number}'
    )
    # TODO: replace stub with actual panoramisk async send
    # asyncio.run(_send_ami_action(action_payload))
    return {
        'status':      'originating',
        'extension':   ext,
        'destination': phone_number,
        'customer_id': str(customer_id) if customer_id else None,
    }


def originate_call_for_campaign(member) -> dict:
    """
    Campaign auto-dialer variant — uses first agent in campaign queue.
    member: CampaignMember instance.
    """
    phone = member.customer.primary_phone
    if not phone:
        raise IntegrationException(
            f'Customer {member.customer} has no primary phone.'
        )
    logger.info(
        f'[Campaign Originate] campaign={member.campaign_id} '
        f'customer={member.customer}'
    )
    # TODO: resolve queue agent and originate
    return {'status': 'queued', 'phone': phone}


# ─── CDR Sync ────────────────────────────────────────────────────────────────

def sync_cdr_records():
    """
    Pull CDR rows from Asterisk MySQL (asteriskcdrdb) and upsert
    into the Django calls.Call table using uniqueid as the key.
    Called every 60 s by Celery beat.
    """
    logger.info('[CDR Sync] Starting CDR synchronisation...')
    try:
        import MySQLdb  # mysqlclient
        from django.conf import settings as cfg

        conn = MySQLdb.connect(
            host=getattr(cfg, 'CDR_DB_HOST', '127.0.0.1'),
            port=int(getattr(cfg, 'CDR_DB_PORT', 3306)),
            db=getattr(cfg, 'CDR_DB_NAME', 'asteriskcdrdb'),
            user=getattr(cfg, 'CDR_DB_USER', 'root'),
            passwd=getattr(cfg, 'CDR_DB_PASS', ''),
        )
        cursor = conn.cursor()
        # Fetch the last 200 records not yet in our DB
        cursor.execute(
            """
            SELECT uniqueid, linkedid, src, dst, dcontext,
                   calldate, duration, billsec, disposition, recordingfile
            FROM   cdr
            ORDER  BY calldate DESC
            LIMIT  200
            """
        )
        rows = cursor.fetchall()
        _upsert_cdr_rows(rows)
        conn.close()
    except ImportError:
        logger.warning('[CDR Sync] mysqlclient not installed — skipping.')
    except Exception as exc:
        logger.error(f'[CDR Sync] Failed: {exc}')
    logger.info('[CDR Sync] Complete.')


def _upsert_cdr_rows(rows):
    from apps.calls.models import Call
    from django.utils import timezone
    from apps.customers.selectors import find_customer_by_phone
    import datetime

    for row in rows:
        (uniqueid, linkedid, src, dst, dcontext,
         calldate, duration, billsec, disposition, recfile) = row

        status_map = {
            'ANSWERED':   'answered',
            'NO ANSWER':  'no_answer',
            'BUSY':       'busy',
            'FAILED':     'failed',
        }
        call_status = status_map.get(disposition, 'no_answer')
        direction   = 'inbound' if dcontext in ('from-queue', 'from-pstn') else 'outbound'

        rec_url = ''
        if recfile:
            base = getattr(settings, 'RECORDING_BASE_URL', '')
            rec_url = f'{base}/{recfile}'

        started_at = calldate if isinstance(calldate, datetime.datetime) else None
        customer   = find_customer_by_phone(src)

        Call.objects.update_or_create(
            uniqueid=uniqueid,
            defaults={
                'linkedid':       linkedid or '',
                'caller_number':  src,
                'callee_number':  dst,
                'direction':      direction,
                'status':         call_status,
                'duration':       billsec or 0,
                'started_at':     started_at,
                'recording_file': recfile or '',
                'recording_url':  rec_url,
                'customer':       customer,
            }
        )


# ─── Call Event Handler ───────────────────────────────────────────────────────

def handle_call_event(event_data: dict):
    """
    Process a raw AMI event dict and:
      - Create / update Call records.
      - Resolve customer via phone number.
      - Push real-time WebSocket events to agents and supervisors.
    """
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from apps.calls.services import create_call_from_ami, update_call_status
    from apps.customers.selectors import find_customer_by_phone

    event_type = event_data.get('Event', '')
    uniqueid   = event_data.get('Uniqueid', '')
    caller     = event_data.get('CallerIDNum', '')
    exten      = event_data.get('Exten', '')
    channel_layer = get_channel_layer()

    if event_type == 'Newchannel':
        call = create_call_from_ami({
            'uniqueid':    uniqueid,
            'linkedid':    event_data.get('Linkedid', ''),
            'calleridnum': caller,
            'exten':       exten,
            'direction':   'inbound',
        })
        customer = find_customer_by_phone(caller)
        if customer:
            from apps.calls.models import Call
            Call.objects.filter(uniqueid=uniqueid).update(customer=customer)

        ws_payload = {
            'type':            'incoming_call',
            'uniqueid':        uniqueid,
            'caller':          caller,
            'queue':           event_data.get('Queue', ''),
            'agent_extension': exten,
            'customer_id':     str(customer.id) if customer else None,
            'customer_name':   customer.get_full_name() if customer else None,
        }
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {'type': 'call.event', 'payload': ws_payload}
        )
        logger.info(f'[AMI] Newchannel: {uniqueid} from {caller}')

    elif event_type == 'Bridge':
        update_call_status(uniqueid, 'answered')
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {'type': 'call.event', 'payload': {
                'type': 'call_answered', 'uniqueid': uniqueid
            }}
        )

    elif event_type == 'Hangup':
        cause  = event_data.get('Cause', '0')
        status = 'answered' if cause == '16' else 'no_answer'
        update_call_status(uniqueid, status)
        async_to_sync(channel_layer.group_send)(
            'supervisors',
            {'type': 'call.event', 'payload': {
                'type': 'call_ended', 'uniqueid': uniqueid, 'status': status
            }}
        )
        logger.info(f'[AMI] Hangup: {uniqueid} cause={cause}')


# ─── Resolve Customer ─────────────────────────────────────────────────────────

def resolve_customer_from_phone(phone_number: str):
    """
    Lookup a Customer by phone number.
    Used by screen-pop API endpoint and AMI handler.
    """
    from apps.customers.selectors import find_customer_by_phone
    return find_customer_by_phone(phone_number)
