import logging
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)



@shared_task(bind=True, max_retries=0, soft_time_limit=86400, time_limit=86401)
def keep_agent_ready(self, agent_num: str, user_id: str):
    """
    Permanent heartbeat with graceful shutdown support.
    Uses SoftTimeLimitExceeded for clean stop on Ctrl+C / revoke.
    """
    import pymysql, time, logging
    from celery.exceptions import SoftTimeLimitExceeded
    from django.conf import settings
    from apps.users.services import update_user_status, _notify_status_change
    from apps.users.models   import User

    _log            = logging.getLogger(__name__)
    last_crm_status = None
    db_errors       = 0
    MAX_DB_ERRORS   = 5

    _log.info(f'[Heartbeat] Started for agent={agent_num} user={user_id}')

    try:
        while True:
            try:
                conn = pymysql.connect(
                    host            = getattr(settings, 'VICIDIAL_DB_HOST', '192.168.2.222'),
                    port            = getattr(settings, 'VICIDIAL_DB_PORT', 3306),
                    user            = getattr(settings, 'VICIDIAL_DB_USER', 'cron'),
                    passwd          = getattr(settings, 'VICIDIAL_DB_PASS', '1234'),
                    db              = getattr(settings, 'VICIDIAL_DB_NAME', 'asterisk'),
                    connect_timeout = 3,
                )
                db_errors = 0

                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT status, pause_code FROM vicidial_live_agents WHERE user=%s",
                        (agent_num,)
                    )
                    row = cur.fetchone()

                    if not row:
                        conn.close()
                        if last_crm_status != 'offline':
                            update_user_status(user_id, 'offline')
                            try:
                                user = User.objects.get(pk=user_id)
                                _notify_status_change(user, 'offline')
                            except Exception:
                                pass
                            last_crm_status = 'offline'
                            _log.info(f'[Heartbeat] CRM → offline (session lost)')
                        time.sleep(5)
                        continue

                    vd_status = row[0]
                    vd_pause  = row[1] or ''

                    if vd_status in ('READY', 'CLOSER'):
                        target_crm = 'available'
                        cur.execute(
                            "UPDATE vicidial_live_agents SET last_update_time=NOW() WHERE user=%s",
                            (agent_num,)
                        )

                    elif vd_status == 'INCALL':
                        target_crm = 'on_call'

                    elif vd_status == 'PAUSED' and vd_pause in ('LOGIN', ''):
                        cur.execute(
                            "UPDATE vicidial_live_agents "
                            "SET status='CLOSER', pause_code='', outbound_autodial='N', last_update_time=NOW() "
                            "WHERE user=%s",
                            (agent_num,)
                        )
                        _log.info(f'[Heartbeat] ♻️  Overrode LAGGED/LOGIN pause')
                        target_crm = 'available'

                    elif vd_status == 'PAUSED' and vd_pause not in ('LOGIN', ''):
                        target_crm = 'away'

                    elif vd_status == 'DISPO':
                        target_crm = 'busy'

                    else:
                        target_crm = 'available'

                conn.commit()
                conn.close()

                if target_crm != last_crm_status:
                    update_user_status(user_id, target_crm)
                    try:
                        user = User.objects.get(pk=user_id)
                        _notify_status_change(user, target_crm)
                    except Exception:
                        pass
                    _log.info(f'[Heartbeat] CRM → {target_crm} (VD={vd_status}/{vd_pause})')
                    last_crm_status = target_crm

                    if target_crm == 'away':
                        _log.info(f'[Heartbeat] Manual break — stopping')
                        return f'stopped: manual break {vd_pause}'

            except SoftTimeLimitExceeded:
                raise

            except Exception as e:
                db_errors += 1
                _log.error(f'[Heartbeat] DB error ({db_errors}/{MAX_DB_ERRORS}): {e}')
                if db_errors >= MAX_DB_ERRORS:
                    try:
                        update_user_status(user_id, 'offline')
                        user = User.objects.get(pk=user_id)
                        _notify_status_change(user, 'offline')
                    except Exception:
                        pass
                    last_crm_status = 'offline'
                    db_errors = 0

            time.sleep(2)

    except SoftTimeLimitExceeded:
        _log.info(f'[Heartbeat] Graceful shutdown for agent {agent_num}')
        return f'stopped: shutdown'

@shared_task(bind=True, max_retries=3)
def notify_incoming_call(self, call_id: str):
    """
    Called by the AMI listener when a new inbound call arrives.
    Pushes an incoming_call event to the assigned agent via WebSocket.
    """
    from .models import Call

    try:
        call = Call.objects.select_related(
            'customer', 'agent', 'lead'
        ).get(pk=call_id)
    except Call.DoesNotExist:
        logger.error(f'[Notify] Call {call_id} not found')
        return

    # ── Build rich customer payload ──────────────────────────
    customer     = call.customer
    customer_data = {}
    if customer:
        customer_data = {
            'customer_id':      str(customer.id),
            'customer_name':    customer.get_full_name(),
            'customer_phone':   customer.primary_phone or call.caller,
            'customer_company': getattr(customer, 'company', None) or '',
        }
    else:
        customer_data = {
            'customer_id':      None,
            'customer_name':    None,
            'customer_phone':   call.caller,
            'customer_company': None,
        }

    # ── Lead info ─────────────────────────────────────────────
    lead_data = {}
    if call.lead_id:
        try:
            lead_data = {
                'lead_id':    str(call.lead_id),
                'lead_title': call.lead.title if call.lead else None,
            }
        except Exception:
            lead_data = {'lead_id': str(call.lead_id), 'lead_title': None}
    else:
        lead_data = {'lead_id': None, 'lead_title': None}

    payload = {
        'type':      'incoming_call',
        'call_id':   str(call.id),
        'uniqueid':  call.uniqueid,
        'caller':    call.caller,
        'callee':    call.callee,
        'queue':     call.queue or '',
        'direction': call.direction,
        **customer_data,
        **lead_data,
    }

    channel_layer = get_channel_layer()

    import asyncio

    async def _push():
        groups = ['supervisors']
        if call.agent_id:
            groups.append(f'agent_{call.agent_id}')
        for group in groups:
            try:
                await channel_layer.group_send(
                    group,
                    {'type': 'call_event', 'payload': payload}
                )
                logger.info(f'[Notify] Sent to {group}')
            except Exception as exc:
                logger.error(f'[Notify] Push to {group} failed: {exc}')

    import threading
    import concurrent.futures

    def _run_in_thread():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_push())
        finally:
            loop.close()

    # Run in a brand new thread with its own event loop — avoids uvicorn loop conflict
    t = threading.Thread(target=_run_in_thread, daemon=True)
    t.start()
    t.join(timeout=5)

    return f'Notified: {call_id}'


@shared_task(bind=True, max_retries=3)
def notify_call_ended(self, call_id: str, status: str):
    """
    Called when a call ends.
    Pushes call_ended event so frontend can update the UI.
    """
    from .models import Call

    try:
        call = Call.objects.select_related('agent').get(pk=call_id)
    except Call.DoesNotExist:
        return

    payload = {
        'type':     'call_ended',
        'uniqueid': call.uniqueid,
        'call_id':  str(call.id),
        'status':   status,
    }

    channel_layer = get_channel_layer()

    import asyncio

    async def _push_ended():
        if call.agent_id:
            try:
                await channel_layer.group_send(
                    f'agent_{call.agent_id}',
                    {'type': 'call_event', 'payload': payload}
                )
                logger.info(f'[CallEnded] Sent to agent_{call.agent_id}')
            except Exception as exc:
                logger.error(f'[CallEnded] Push failed: {exc}')

    try:
        asyncio.run(_push_ended())
    except Exception as exc:
        logger.error(f'[CallEnded] asyncio.run error: {exc}')

    return f'CallEnded notified: {call_id}'


@shared_task(bind=True, max_retries=5, default_retry_delay=10)
def process_ami_event(self, event: dict):
    """
    Processes a raw AMI event dict from the Asterisk listener.
    Creates/updates Call records accordingly.
    """
    from django.utils import timezone
    from .models import Call
    from apps.customers.models import CustomerPhone
    from apps.users.models import Extension

    event_name = event.get('Event', '')
    uniqueid   = event.get('Uniqueid') or event.get('Linkedid', '')

    try:
        if event_name == 'Newchannel':
            # Skip internal leg channels (Local/ channels created by queue)
            chan_name = event.get('Channel', '')
            if chan_name.startswith('Local/'):
                logger.debug(f'[AMI] Skipping Local channel: {chan_name}')
                return

            # Skip extension-to-extension internal calls (short exten, from-internal)
            caller_num = event.get('CallerIDNum', '')
            context    = event.get('Context', '')
            exten      = event.get('Exten', '')

            # Only create call record for truly inbound trunk calls here
            # Queue calls are handled by QueueCallerJoin instead
            INBOUND_CONTEXTS = {
                'from-trunk', 'from-pstn', 'from-did',
                'from-sip-external', 'ext-did', 'from-external',
                'from-did-direct', 'from-pstn-toheader',
            }
            if context not in INBOUND_CONTEXTS:
                logger.debug(f'[AMI] Newchannel skipped — context={context}')
                return

            caller    = caller_num
            callee    = exten
            direction = 'inbound'

            # Agent detection — not known yet at Newchannel for trunk calls
            agent    = None
            customer = None
            if caller and len(caller) >= 7:
                try:
                    phone = CustomerPhone.objects.select_related('customer').filter(
                        normalized__endswith=caller[-9:]
                    ).first()
                    if phone:
                        customer = phone.customer
                        logger.info(f'[AMI] Customer matched: {customer}')
                except Exception as e:
                    logger.debug(f'[AMI] Screen pop error: {e}')

            call, created = Call.objects.get_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':     caller,
                    'callee':     callee,
                    'direction':  direction,
                    'status':     'ringing',
                    'customer':   customer,
                    'agent':      agent,
                    'started_at': timezone.now(),
                }
            )
            if created:
                notify_incoming_call.apply(args=[str(call.id)])
                logger.info(f'[AMI] New trunk call: {uniqueid} | {caller} → {callee}')

        elif event_name == 'QueueCallerJoin':
            # ── This is the correct event for queue inbound calls ──
            # Fired when caller enters the queue — has real CallerIDNum
            caller    = event.get('CallerIDNum', '')
            queue     = event.get('Queue', '')

            # Customer lookup
            customer = None
            if caller and len(caller) >= 3:
                try:
                    phone = CustomerPhone.objects.select_related('customer').filter(
                        normalized__endswith=caller[-9:] if len(caller) >= 9 else caller
                    ).first()
                    if phone:
                        customer = phone.customer
                        logger.info(f'[AMI] Customer matched: {customer}')
                except Exception as e:
                    logger.debug(f'[AMI] Screen pop error: {e}')

            # Always update/create — Newchannel may have created a wrong record first
            call, created = Call.objects.update_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':     caller,
                    'callee':     queue,
                    'direction':  'inbound',
                    'status':     'ringing',
                    'queue':      queue,
                    'customer':   customer,
                    'started_at': timezone.now(),
                }
            )
            # Always notify — whether new or updated from Newchannel
            notify_incoming_call.apply(args=[str(call.id)])
            logger.info(f'[AMI] Queue call: {uniqueid} | caller={caller} queue={queue} new={created}')

        elif event_name == 'QueueCallerJoin':
            # Authoritative inbound event: real caller joins the queue
            caller = event.get('CallerIDNum', '')
            queue  = event.get('Queue', '')

            # Customer screen pop
            customer = None
            if caller and len(caller) >= 4:
                try:
                    from apps.customers.models import CustomerPhone
                    phone = CustomerPhone.objects.select_related('customer').filter(
                        normalized__endswith=caller[-9:]
                    ).first()
                    if phone:
                        customer = phone.customer
                        logger.info(f'[AMI] QueueJoin customer: {customer}')
                except Exception as e:
                    logger.debug(f'[AMI] QueueJoin lookup error: {e}')

            # update_or_create so we always set correct direction/caller/queue
            # even if Newchannel already made the record with wrong data
            call, created = Call.objects.update_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':    caller,
                    'callee':    queue,
                    'direction': 'inbound',
                    'status':    'ringing',
                    'queue':     queue,
                    'customer':  customer,
                    'started_at': timezone.now(),
                }
            )
            # Always fire the notification here — this is the correct trigger
            notify_incoming_call.apply(args=[str(call.id)])
            logger.info(
                f'[AMI] QueueCallerJoin: uid={uniqueid} caller={caller} '
                f'queue={queue} created={created}'
            )

        elif event_name == 'AgentCalled':
            # Which agent extension was rung for this queue call
            member = event.get('MemberName', '') or event.get('Interface', '')
            linked = event.get('Linkedid', '') or uniqueid
            ext_num = ''
            if '/' in member:
                raw = member.split('/')[1]
                ext_num = raw.split('@')[0].split('-')[0]
            if ext_num:
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    updated = Call.objects.filter(
                        uniqueid=linked, agent__isnull=True
                    ).update(agent=ext_obj.user)
                    if updated:
                        logger.info(
                            f'[AMI] AgentCalled: ext {ext_num} → uid={linked}'
                        )
                except Exception as e:
                    logger.debug(f'[AMI] AgentCalled error: {e}')

        elif event_name == 'Bridge':
            # Asterisk 11: Bridge has Uniqueid1 and Uniqueid2
            uid1 = event.get('Uniqueid1', '')
            uid2 = event.get('Uniqueid2', '')
            for uid in filter(None, [uid1, uid2, uniqueid]):
                updated = Call.objects.filter(uniqueid=uid, status='ringing').update(
                    status='answered',
                    started_at=timezone.now(),
                )
                if updated:
                    logger.info(f'[AMI] Call answered: {uid}')
                    break

        elif event_name in ('Hangup', 'SoftHangupRequest'):
            duration = int(event.get('Duration', 0))
            status_map = {
                '16': 'answered',
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
            }
            cause  = str(event.get('Cause', '16'))
            status = status_map.get(cause, 'failed')

            now = timezone.now()
            # Asterisk 11 لا يبعت Duration في Hangup — نحسبه من started_at
            call_obj = Call.objects.filter(uniqueid=uniqueid).first()
            if call_obj and call_obj.started_at and duration == 0:
                delta = (now - call_obj.started_at).total_seconds()
                duration = max(0, int(delta))

            updated = Call.objects.filter(
                uniqueid=uniqueid,
                is_completed=False,
            ).update(
                status=status,
                ended_at=now,
                duration=duration,
            )

            if updated:
                call = Call.objects.filter(uniqueid=uniqueid).first()
                if call:
                    notify_call_ended.apply(args=[str(call.id), status])
                logger.info(f'[AMI] Call ended: {uniqueid} → {status} ({duration}s)')


        elif event_name == 'QueueMemberAdded':
            # Agent logged in to queue
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
                    from apps.users.models import Extension
                    from apps.users.services import update_user_status, _notify_status_change
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    update_user_status(str(ext_obj.user.id), 'available')
                    _notify_status_change(ext_obj.user, 'available')
                    logger.info(f'[AMI] Agent logged in: {ext_num}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentLogin error: {e}')

        elif event_name == 'QueueMemberRemoved':
            # Agent logged off from queue
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
                    from apps.users.models import Extension
                    from apps.users.services import update_user_status, _notify_status_change
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    update_user_status(str(ext_obj.user.id), 'offline')
                    _notify_status_change(ext_obj.user, 'offline')
                    logger.info(f'[AMI] Agent logged off: {ext_num}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentLogoff error: {e}')

        elif event_name in ('QueueMemberPaused', 'QueueMemberStatus'):
            # Agent paused/unpaused
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            paused    = event.get('Paused', '0')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
                    from apps.users.models import Extension
                    from apps.users.services import update_user_status, _notify_status_change
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    new_status = 'away' if paused == '1' else 'available'
                    update_user_status(str(ext_obj.user.id), new_status)
                    _notify_status_change(ext_obj.user, new_status)
                    logger.info(f'[AMI] Agent pause={paused}: {ext_num}')
                except Exception as e:
                    logger.debug(f'[AMI] QueueMemberPause error: {e}')

        elif event_name == 'AgentCalled':
            # Agent is being rung for a queue call — assign agent to the call record
            member_name = event.get('MemberName', '')
            linkedid    = event.get('Linkedid', '') or uniqueid
            if member_name:
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=member_name, is_active=True
                    )
                    agent = ext_obj.user
                    # Update call record with agent
                    Call.objects.filter(uniqueid=linkedid, agent__isnull=True).update(agent=agent)
                    logger.info(f'[AMI] Agent assigned to call: {member_name} → {linkedid}')
                except Extension.DoesNotExist:
                    logger.debug(f'[AMI] No agent for MemberName: {member_name}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentCalled error: {e}')

        elif event_name == 'AgentConnect':
            # Agent answered a queue call — update call status + agent status
            member_name = event.get('MemberName', '')
            linkedid    = event.get('Linkedid', '') or uniqueid
            if member_name:
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=member_name, is_active=True
                    )
                    agent = ext_obj.user
                    # Assign agent and mark answered
                    Call.objects.filter(uniqueid=linkedid).update(
                        agent=agent,
                        status='answered',
                        started_at=timezone.now(),
                    )
                    from apps.users.services import update_user_status, _notify_status_change
                    update_user_status(str(agent.id), 'on_call')
                    _notify_status_change(agent, 'on_call')
                    logger.info(f'[AMI] AgentConnect: {member_name} answered {linkedid}')
                except Extension.DoesNotExist:
                    logger.debug(f'[AMI] No agent for MemberName: {member_name}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentConnect error: {e}')

        elif event_name in ('AgentComplete', 'AgentRinghangup'):
            # Call completed — set back to available
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
                    from apps.users.models import Extension
                    from apps.users.services import update_user_status, _notify_status_change
                    ext_obj = Extension.objects.select_related('user').get(
                        number=ext_num, is_active=True
                    )
                    update_user_status(str(ext_obj.user.id), 'available')
                    _notify_status_change(ext_obj.user, 'available')
                    logger.info(f'[AMI] Agent available again: {ext_num}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentComplete error: {e}')

    except Exception as exc:
        logger.error(f'[AMI] Error processing {event_name}: {exc}')
        raise self.retry(exc=exc)
