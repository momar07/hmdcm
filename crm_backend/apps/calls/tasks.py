import logging
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)




@shared_task(bind=True, max_retries=3)
def notify_incoming_call(self, call_id: str):
    """
    Called by the AMI listener when a new inbound call arrives.
    Sends lead info via WebSocket.
    """
    from .models import Call

    try:
        call = Call.objects.select_related('agent', 'lead').get(pk=call_id)
    except Call.DoesNotExist:
        logger.error(f'[Notify] Call {call_id} not found')
        return

    # ── Lead info ────────────────────────────────────────────
    lead = call.lead
    lead_data = {}
    if lead:
        lead_data = {
            'lead_id':        str(lead.id),
            'lead_title':     lead.title,
            'lead_phone':     lead.phone or call.caller,
            'lead_stage':     lead.stage.name  if lead.stage  else None,
            'lead_status':    lead.status.name if lead.status else None,
            'lead_assigned':  lead.assigned_to.get_full_name() if lead.assigned_to else None,
            'lead_value':     str(lead.value) if lead.value else None,
            'lead_source':    lead.source,
            'lead_name':      lead.get_full_name(),
            'lead_company':   lead.company or '',
            'lead_email':     lead.email or '',
        }
    else:
        lead_data = {
            'lead_id': None, 'lead_title': None, 'lead_phone': call.caller,
            'lead_stage': None, 'lead_status': None, 'lead_assigned': None,
            'lead_value': None, 'lead_source': 'call',
            'lead_name': None, 'lead_company': None, 'lead_email': None,
        }

    payload = {
        'type':      'incoming_call',
        'call_id':   str(call.id),
        'uniqueid':  call.uniqueid,
        'caller':    call.caller,
        'callee':    call.callee,
        'queue':     call.queue or '',
        'direction': call.direction,
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
    Creates/updates Call records, auto-creates Leads, assigns agents,
    and triggers automation rules.
    """
    from django.utils import timezone
    from .models import Call
    from apps.common.utils import normalize_phone
    from apps.users.models import Extension

    event_name = event.get('Event', '')
    uniqueid   = event.get('Uniqueid') or event.get('Linkedid', '')

    try:
        # ── helpers ───────────────────────────────────────────
        def _find_lead_by_phone(phone: str):
            """Look up existing Lead by phone number."""
            if not phone or len(phone) < 3:
                return None
            suffix = phone[-9:] if len(phone) >= 9 else phone
            try:
                lead = Lead.objects.select_related('assigned_to').filter(
                    phone__endswith=suffix, is_active=True
                ).first()
                return lead
            except Exception as e:
                logger.debug(f'[AMI] Lead lookup error: {e}')
                return None

        def _get_or_create_lead(phone: str):
            """
            Lookup existing Lead by phone, or create a new one.
            """
            lead = _find_lead_by_phone(phone)
            if lead:
                return lead

            first_stage = LeadStage.objects.filter(is_active=True).order_by('order').first()
            lead = Lead.objects.create(
                title       = f'Lead from call — {phone}',
                phone       = phone,
                assigned_to = None,
                source      = 'call',
                stage       = first_stage,
            )
            logger.info(f'[AMI] Auto-created lead: {lead.id} for {phone}')
            return lead

        def _create_call_activity(call_obj, status='in_progress'):
            """Create an Activity record linked to the call's lead."""
            if call_obj.lead_id:
                from .models import Activity
                Activity.objects.create(
                    lead          = call_obj.lead,
                    call          = call_obj,
                    agent         = call_obj.agent,
                    activity_type = 'call',
                    status        = status,
                    title         = f'{call_obj.direction} call — {call_obj.caller}',
                    started_at    = call_obj.started_at,
                )

        def _assign_lead_to_agent(call_obj, agent):
            """Auto-assign lead to the answering agent and log LeadEvent."""
            if call_obj.lead and not call_obj.lead.assigned_to_id:
                call_obj.lead.assigned_to = agent
                call_obj.lead.save(update_fields=['assigned_to'])
                LeadEvent.objects.create(
                    lead       = call_obj.lead,
                    event_type = 'assigned',
                    actor      = agent,
                    new_value  = str(agent.id),
                    note       = f'Auto-assigned from call {call_obj.uniqueid}',
                )
                logger.info(f'[AMI] Lead {call_obj.lead.id} auto-assigned to {agent}')

        # ── event handlers ────────────────────────────────────
        from apps.leads.models import Lead, LeadStage, LeadEvent

        if event_name == 'Newchannel':
            chan_name = event.get('Channel', '')
            if chan_name.startswith('Local/'):
                logger.debug(f'[AMI] Skipping Local channel: {chan_name}')
                return

            caller_num = event.get('CallerIDNum', '')
            context    = event.get('Context', '')
            exten      = event.get('Exten', '')

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

            lead = _get_or_create_lead(caller)

            call, created = Call.objects.get_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':     caller,
                    'callee':     callee,
                    'direction':  direction,
                    'status':     'ringing',
                    'lead':       lead,
                    'agent':      None,
                    'started_at': timezone.now(),
                }
            )
            if created:
                _create_call_activity(call, status='in_progress')
                notify_incoming_call.delay(str(call.id))
                logger.info(f'[AMI] New trunk call: {uniqueid} | {caller} → {callee}')

        elif event_name == 'QueueCallerJoin':
            caller = event.get('CallerIDNum', '')
            queue  = event.get('Queue', '')

            lead = _get_or_create_lead(caller)

            call, created = Call.objects.update_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':     caller,
                    'callee':     queue,
                    'direction':  'inbound',
                    'status':     'ringing',
                    'queue':      queue,
                    'lead':       lead,
                    'started_at': timezone.now(),
                }
            )
            # Create activity only for new calls
            if created:
                _create_call_activity(call, status='in_progress')

            notify_incoming_call.delay(str(call.id))

            # VIP check — trigger automation
            handle_vip_call.delay(str(call.id))

            logger.info(f'[AMI] Queue call: {uniqueid} | caller={caller} queue={queue} new={created}')

        elif event_name == 'Bridge':
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

            if uniqueid and uniqueid.startswith('webrtc-'):
                logger.debug(f'[AMI] Skipping Hangup for WebRTC call: {uniqueid}')
                return

            cause = str(event.get('Cause', '16'))
            cause_status_map = {
                '17': 'busy',
                '19': 'no_answer',
                '21': 'failed',
                '3':  'no_answer',
                '18': 'no_answer',
            }

            now = timezone.now()
            call_obj = Call.objects.filter(uniqueid=uniqueid).first()

            if not call_obj:
                return

            if cause in cause_status_map:
                status = cause_status_map[cause]
            elif call_obj.status == 'answered':
                status = 'answered'
            else:
                import time as _time
                _time.sleep(0.5)
                fresh = Call.objects.filter(uniqueid=uniqueid).values('status').first()
                if fresh and fresh['status'] == 'answered':
                    status = 'answered'
                else:
                    status = 'no_answer'

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
                    # Update activity status
                    if call.lead_id:
                        from .models import Activity
                        Activity.objects.filter(
                            lead=call.lead, call=call, status='in_progress'
                        ).update(
                            status='completed',
                            ended_at=now,
                            duration=duration,
                        )

                    notify_call_ended.delay(str(call.id), status)

                    # Missed call automation
                    if status == 'no_answer':
                        handle_missed_call.delay(str(call.id))

                logger.info(f'[AMI] Call ended: {uniqueid} → {status} (cause={cause}, duration={duration}s)')

        elif event_name == 'QueueMemberAdded':
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
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
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
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
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            paused    = event.get('Paused', '0')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
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
            member_name = event.get('MemberName', '')
            linkedid    = event.get('Linkedid', '') or uniqueid
            if member_name:
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=member_name, is_active=True
                    )
                    agent = ext_obj.user
                    Call.objects.filter(uniqueid=linkedid, agent__isnull=True).update(agent=agent)
                    logger.info(f'[AMI] Agent assigned to call: {member_name} → {linkedid}')
                except Extension.DoesNotExist:
                    logger.debug(f'[AMI] No agent for MemberName: {member_name}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentCalled error: {e}')

        elif event_name == 'AgentConnect':
            member_name = event.get('MemberName', '')
            linkedid    = event.get('Linkedid', '') or uniqueid
            if member_name:
                try:
                    ext_obj = Extension.objects.select_related('user').get(
                        number=member_name, is_active=True
                    )
                    agent = ext_obj.user

                    Call.objects.filter(uniqueid=linkedid).update(
                        agent=agent,
                        status='answered',
                        started_at=timezone.now(),
                    )

                    # Auto-assign lead to agent
                    call_obj = Call.objects.filter(uniqueid=linkedid).select_related('lead').first()
                    if call_obj:
                        _assign_lead_to_agent(call_obj, agent)

                    from apps.users.services import update_user_status, _notify_status_change
                    update_user_status(str(agent.id), 'on_call')
                    _notify_status_change(agent, 'on_call')
                    logger.info(f'[AMI] AgentConnect: {member_name} answered {linkedid}')
                except Extension.DoesNotExist:
                    logger.debug(f'[AMI] No agent for MemberName: {member_name}')
                except Exception as e:
                    logger.debug(f'[AMI] AgentConnect error: {e}')

        elif event_name in ('AgentComplete', 'AgentRinghangup'):
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            if '/' in interface:
                ext_num = interface.split('/')[1]
                try:
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
    ).select_related('assigned_to', 'lead', 'call__lead')

    if not due_followups.exists():
        return 'No reminders due'

    channel_layer = get_channel_layer()

    def _get_lead_phone(f):
        if f.lead and f.lead.phone:
            return f.lead.phone
        if f.call and f.call.lead and f.call.lead.phone:
            return f.call.lead.phone
        if f.call and f.call.caller:
            return f.call.caller
        return None

    sent_ids = []
    for f in due_followups:
        lead = f.lead or (f.call.lead if f.call else None)
        lead_name = lead.get_full_name() if lead else 'Unknown'
        lead_phone = _get_lead_phone(f)

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
            'lead_name':    lead_name,
            'lead_phone':   lead_phone,
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


@shared_task(bind=True, max_retries=2)
def handle_missed_call(self, call_id: str):
    """
    Triggered when a call ends as no_answer.
    Creates a callback followup for the assigned agent.
    """
    import datetime
    from django.utils import timezone as tz
    from .models import Call, AutomationRule
    from apps.followups.models import Followup

    try:
        call = Call.objects.select_related('agent', 'lead').get(pk=call_id)
    except Call.DoesNotExist:
        return

    rule = AutomationRule.objects.filter(
        trigger__in=['missed_call', 'no_answer'],
        action='create_callback',
        is_active=True,
    ).first()
    if not rule:
        logger.info(f'[Automation] No missed-call rule active — skipping {call_id}')
        return

    config = rule.config or {}
    delay_hours = config.get('callback_delay_hours', 2)

    agent = call.agent
    if not agent and call.lead and call.lead.assigned_to:
        agent = call.lead.assigned_to

    if not agent:
        logger.warning(f'[Automation] No agent for missed call {call_id} — skipping')
        return

    name = call.lead.get_full_name() if call.lead else call.caller
    Followup.objects.create(
        lead          = call.lead,
        call          = call,
        assigned_to   = agent,
        title         = f'Callback: {name}',
        description   = f'Missed call — duration: {call.duration}s, cause: {call.status}',
        followup_type = 'call',
        scheduled_at  = tz.now() + datetime.timedelta(hours=delay_hours),
        status        = 'pending',
    )

    logger.info(f'[Automation] Callback created for missed call {call_id} → agent {agent}')
    return f'Callback created for {call_id}'


@shared_task(bind=True, max_retries=2)
def handle_vip_call(self, call_id: str):
    """
    Triggered on incoming call. If lead is VIP, notify all supervisors.
    """
    from .models import Call
    from apps.users.models import User

    try:
        call = Call.objects.select_related('lead').get(pk=call_id)
    except Call.DoesNotExist:
        return

    lead = call.lead
    if not lead:
        return

    # Check VIP: tag named 'VIP' or has a company
    is_vip = lead.tags.filter(name__iexact='vip').exists()
    if not is_vip and lead.company:
        is_vip = True

    if not is_vip:
        return

    supervisors = User.objects.filter(
        role__in=['supervisor', 'admin'], is_active=True
    )
    if not supervisors.exists():
        return

    payload = {
        'type':           'vip_incoming',
        'call_id':        str(call.id),
        'lead_name':      lead.get_full_name(),
        'lead_phone':     lead.phone or call.caller,
        'company':        lead.company or '',
    }

    channel_layer = get_channel_layer()

    for sup in supervisors:
        async def _push(sid=str(sup.id)):
            try:
                await channel_layer.group_send(
                    f'agent_{sid}',
                    {'type': 'call_event', 'payload': payload}
                )
                logger.info(f'[Automation] VIP alert sent to supervisor {sid}')
            except Exception as exc:
                logger.error(f'[Automation] VIP push failed for {sid}: {exc}')

        import threading, asyncio
        def _run():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_push())
            finally:
                loop.close()

        t = threading.Thread(target=_run, daemon=True)
        t.start()

    logger.info(f'[Automation] VIP alert for {call.lead.get_full_name() if call.lead else "Unknown"} ({lead.company or "No company"})')
    return f'VIP alert: {call.lead.get_full_name() if call.lead else "Unknown"}'
