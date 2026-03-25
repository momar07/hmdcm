import logging
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)




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
            # Assigned call — notify the specific agent
            groups.append(f'agent_{call.agent_id}')
        else:
            # Queue call not yet answered — notify ALL agents
            groups.append('agents')
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

    import threading
    def _run_ended():
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_push_ended())
        finally:
            loop.close()

    t = threading.Thread(target=_run_ended, daemon=True)
    t.start()
    t.join(timeout=5)

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
                notify_incoming_call.delay(str(call.id))
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
            notify_incoming_call.delay(str(call.id))
            logger.info(f'[AMI] Queue call: {uniqueid} | caller={caller} queue={queue} new={created}')

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

            # Skip WebRTC calls — their status is managed by endWebrtcCall endpoint
            if uniqueid and uniqueid.startswith('webrtc-'):
                logger.debug(f'[AMI] Skipping Hangup for WebRTC call: {uniqueid}')
                return

            # Cause 16 = Normal Clearing — used for ALL hangups including unanswered
            # We check the current call status to determine the real outcome
            cause = str(event.get('Cause', '16'))
            cause_status_map = {
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
                '3':  'no_answer',   # No route to destination
                '18': 'no_answer',   # No user responding
            }

            now = timezone.now()
            call_obj = Call.objects.filter(uniqueid=uniqueid).first()

            if not call_obj:
                return

            # Determine real status:
            # - If cause explicitly maps to something, use it
            # - If cause is 16 (normal) AND call was never answered → no_answer
            # - If cause is 16 AND call was answered → answered
            if cause in cause_status_map:
                status = cause_status_map[cause]
            elif call_obj.status == 'answered':
                # Already marked answered by AgentConnect — keep it
                status = 'answered'
            else:
                # Re-fetch from DB to catch AgentConnect that may have just fired
                # Small sleep to handle race condition with AgentConnect task
                import time as _time
                _time.sleep(0.5)
                fresh = Call.objects.filter(uniqueid=uniqueid).values('status').first()
                if fresh and fresh['status'] == 'answered':
                    status = 'answered'
                else:
                    status = 'no_answer'

            # Calculate duration from started_at if Asterisk didn't send it
            if duration == 0 and call_obj.started_at and status == 'answered':
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
                    notify_call_ended.delay(str(call.id), status)
                logger.info(f'[AMI] Call ended: {uniqueid} → {status} (cause={cause}, duration={duration}s)')


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


@shared_task(bind=True, max_retries=2)
def send_followup_reminders(self):
    """
    Run every minute via Celery beat (or every 5 min via threading.Timer fallback).
    Finds followups due in the next 15 minutes that haven't had a reminder sent,
    and pushes a WebSocket notification to the assigned agent.
    """
    import datetime
    from django.utils import timezone as tz
    from apps.followups.models import Followup

    now     = tz.now()
    window  = now + datetime.timedelta(minutes=15)

    due_followups = Followup.objects.filter(
        status       = 'pending',
        scheduled_at__gte = now,
        scheduled_at__lte = window,
        reminder_sent = False,
    ).select_related('assigned_to', 'lead__customer', 'call__customer')

    if not due_followups.exists():
        return 'No reminders due'

    channel_layer = get_channel_layer()

    def _get_customer(f):
        if f.lead and f.lead.customer:
            return f.lead.customer
        if f.call and f.call.customer:
            return f.call.customer
        return None

    def _get_customer_phone(customer):
        if not customer:
            return None
        primary = customer.phones.filter(is_primary=True, is_active=True).first()
        if primary:
            return primary.number
        any_p = customer.phones.filter(is_active=True).first()
        return any_p.number if any_p else None

    sent_ids = []
    for f in due_followups:
        customer     = _get_customer(f)
        customer_id  = str(customer.id) if customer else None
        customer_name= f'{customer.first_name} {customer.last_name}'.strip() if customer else None
        customer_phone = _get_customer_phone(customer)

        # Ensure scheduled_at is always a proper ISO string with timezone
        scheduled_str = f.scheduled_at.isoformat() if f.scheduled_at else ''
        if scheduled_str and not (scheduled_str.endswith('Z') or '+' in scheduled_str):
            scheduled_str += '+00:00'   # treat naive as UTC

        payload = {
            'type':         'followup_reminder',
            'followup_id':  str(f.id),
            'title':        f.title,
            'followup_type':f.followup_type,
            'scheduled_at': scheduled_str,
            'customer':     customer_name or 'Unknown',
            'customer_id':  customer_id,
            'customer_phone': customer_phone,
            'lead_id':      str(f.lead_id) if f.lead_id else None,
        }

        agent_id = str(f.assigned_to_id)

        async def _push(aid, p):
            try:
                await channel_layer.group_send(
                    f'agent_{aid}',
                    {'type': 'call_event', 'payload': p}
                )
            except Exception as exc:
                logger.error(f'[Reminder] Push failed for agent {aid}: {exc}')

        import threading
        def _run(aid=agent_id, p=payload):
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_push(aid, p))
            finally:
                loop.close()

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=3)
        sent_ids.append(f.id)
        logger.info(f'[Reminder] Sent for followup {f.id} to agent {agent_id}')

    # Mark reminders as sent
    Followup.objects.filter(id__in=sent_ids).update(reminder_sent=True)
    return f'Sent {len(sent_ids)} reminders'
