import logging
from celery import shared_task
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from datetime import timedelta

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
    # Filter out numeric-only SIP extensions from CallerIDName
    caller_name_clean = ''
    if call.caller_name and not call.caller_name.isdigit():
        caller_name_clean = call.caller_name

    lead_data = {}
    if lead:
        lead_display_name = lead.get_full_name()
        if lead_display_name and lead.phone and lead_display_name.strip() == lead.phone.strip():
            lead_display_name = lead.title or caller_name_clean or lead.phone
        lead_data = {
            'lead_id':        str(lead.id),
            'lead_title':     lead.title,
            'lead_phone':     lead.phone or call.caller,
            'lead_stage':     lead.stage.name  if lead.stage  else None,
            'lead_status':    lead.status.name if lead.status else None,
            'lead_assigned':  lead.assigned_to.get_full_name() if lead.assigned_to else None,
            'lead_value':     str(lead.value) if lead.value else None,
            'lead_source':    lead.source,
            'lead_name':      lead_display_name,
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
        'type':        'incoming_call',
        'call_id':     str(call.id),
        'uniqueid':    call.uniqueid,
        'caller':      call.caller,
        'caller_name': caller_name_clean,
        'callee':      call.callee,
        'queue':       call.queue or '',
        'direction':   call.direction,
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
        # TODO[review]: replace threading+join with:
        #     async_to_sync(channel_layer.group_send)(group, {...})
        # See INCOMING_FLOW review fix #2.


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
        # TODO[review]: replace threading+join with:
        #     async_to_sync(channel_layer.group_send)(group, {...})
        # See INCOMING_FLOW review fix #2.


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



def _map_ami_to_webhook_type(ami_event_name: str) -> str:
    """Map AMI event name to WebhookEvent.EVENT_TYPES choice."""
    mapping = {
        'Newchannel':       'incoming',
        'QueueCallerJoin':  'incoming',
        'Bridge':           'answered',
        'AgentConnect':     'answered',
        'Hangup':           'ended',
        'SoftHangupRequest':'ended',
    }
    return mapping.get(ami_event_name, 'incoming')


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

    # ── Idempotency guard: skip duplicate AMI events ──
    # Guards against: Asterisk re-delivery, AMI listener reconnect backfill,
    # double-listener race conditions. Only events with both uniqueid AND
    # event_name are guarded — minor safety check.
    if uniqueid and event_name:
        try:
            from .models import WebhookEvent
            _wh, _created = WebhookEvent.objects.get_or_create(
                uniqueid=uniqueid,
                event_type=_map_ami_to_webhook_type(event_name),
                defaults={'processed': False, 'raw_payload': {'event': event_name}},
            )
            if not _created and _wh.processed:
                logger.debug(f'[AMI] Skip duplicate {event_name} for {uniqueid}')
                return f'Duplicate skipped: {event_name} {uniqueid}'
        except Exception as _e:
            # لو الـ WebhookEvent fail (مثلاً مشكلة في الـ DB)، كمل عادي
            logger.warning(f'[AMI] WebhookEvent guard error: {_e}')

    try:
        # ── helpers ───────────────────────────────────────────
        def _find_lead_by_phone(phone: str):
            """Look up existing Lead by phone number using normalized variants."""
            if not phone or len(phone) < 3:
                return None
            from apps.common.utils import normalize_phone
            normalized = normalize_phone(phone)
            if not normalized:
                return None
            try:
                variants = set()
                variants.add(normalized)
                digits = normalized.lstrip('0')
                variants.add(digits)
                variants.add('+20' + digits)
                variants.add('20' + digits)
                variants.add('0020' + digits)
                if len(normalized) >= 9:
                    variants.add(normalized[-9:])
                if len(digits) >= 9:
                    variants.add(digits[-9:])
                variants.discard('')
                variants.discard('0')
                logger.info(f'[AMI] Lead lookup: input={phone!r} normalized={normalized!r} variants={variants}')
                match = Lead.objects.select_related('assigned_to').filter(
                    phone__in=variants, is_active=True
                ).order_by('-updated_at').first()
                if match:
                    logger.info(f'[AMI] Lead found by exact match: id={match.id} phone={match.phone!r} name={match.get_full_name()!r}')
                    return match
                match = Lead.objects.select_related('assigned_to').filter(
                    phone__endswith=normalized[-9:] if len(normalized) >= 9 else normalized,
                    is_active=True,
                ).order_by('-updated_at').first()
                if match:
                    logger.info(f'[AMI] Lead found by suffix match: id={match.id} phone={match.phone!r} name={match.get_full_name()!r}')
                else:
                    logger.info(f'[AMI] No lead found for phone={phone!r}')
                return match
            except Exception as e:
                logger.error(f'[AMI] Lead lookup error for phone={phone!r}: {e}')
                return None

        def _clean_caller_name(raw: str) -> str:
            """Strip numeric-only SIP extensions from CallerIDName."""
            if not raw:
                return ''
            raw = str(raw).strip()
            if not raw or raw.isdigit():
                return ''
            return raw

        def _find_lead(phone: str):
            """
            Lookup existing Lead by phone only. Does NOT auto-create.
            Unknown callers will have lead=None on the Call record.
            Lead is created later when agent explicitly creates one from /leads/new.
            """
            return _find_lead_by_phone(phone)

        def _create_call_activity(call_obj, status='in_progress'):
            """Create an Activity record linked to the call's lead."""
            if call_obj.lead_id:
                from .models import Activity
                Activity.objects.get_or_create(
                    call=call_obj,
                    activity_type='call',
                    defaults=dict(
                    lead          = call_obj.lead,
                    call          = call_obj,
                    agent         = call_obj.agent,
                    activity_type = 'call',
                    status        = status,
                    title         = f'{call_obj.direction} call — {call_obj.caller}',
                        started_at = call_obj.started_at,
                    ),
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

        def _log_agent_event(call_obj, agent, event_type, ring_duration=0, note=''):
            """Create a CallAgentEvent record and a LeadEvent if call has a lead."""
            from .models import CallAgentEvent
            CallAgentEvent.objects.create(
                call          = call_obj,
                agent         = agent,
                event_type    = event_type,
                ring_duration = ring_duration,
                note          = note,
            )
            logger.info(f'[AMI] CallAgentEvent: {event_type} agent={agent} call={call_obj.id} ring={ring_duration}s')
            if call_obj.lead:
                event_map = {
                    'offered':    'call_offered',
                    'answered':   'call_answered',
                    'rejected':   'call_rejected',
                    'timeout':    'call_no_answer',
                    'ringhangup': 'call_rejected',
                }
                lead_event_type = event_map.get(event_type)
                if lead_event_type:
                    agent_name = agent.get_full_name() if hasattr(agent, 'get_full_name') else str(agent)
                    LeadEvent.objects.create(
                        lead       = call_obj.lead,
                        event_type = lead_event_type,
                        actor      = agent,
                        new_value  = agent_name,
                        note       = note or f'{event_type.replace("_", " ").title()} — {call_obj.caller}',
                    )

        def _extract_extension_candidates(raw_value: str):
            """Extract likely extension tokens from AMI fields."""
            import re

            if not raw_value:
                return []

            raw = str(raw_value).strip()
            if not raw:
                return []

            variants = []

            def _add(val):
                val = (val or '').strip()
                if val and val not in variants:
                    variants.append(val)

            _add(raw)

            # Typical AMI formats: PJSIP/300-0001a2b3, SIP/300, Local/300@from-queue
            if '/' in raw:
                right = raw.split('/', 1)[1]
                _add(right)
            else:
                right = raw

            if '-' in right:
                _add(right.split('-', 1)[0])
            if '@' in right:
                _add(right.split('@', 1)[0])

            # Keep pure digit chunks as extension candidates
            for token in re.findall(r'\d{2,8}', raw):
                _add(token)

            return variants

        def _resolve_agent_from_event(event_dict: dict):
            """Resolve CRM agent from AMI event fields with flexible parsing."""
            from django.db.models import Q

            fields = [
                event_dict.get('MemberName', ''),
                event_dict.get('Interface', ''),
                event_dict.get('Location', ''),
                event_dict.get('Member', ''),
                event_dict.get('DestChannel', ''),
                event_dict.get('Channel', ''),
            ]

            candidates = []
            for raw in fields:
                for c in _extract_extension_candidates(raw):
                    if c not in candidates:
                        candidates.append(c)

            if not candidates:
                return None, []

            ext = Extension.objects.select_related('user').filter(
                is_active=True
            ).filter(
                Q(number__in=candidates) | Q(peer_name__in=candidates)
            ).first()

            if not ext:
                return None, candidates

            return ext.user, candidates

        def _resolve_call_from_event(event_dict: dict):
            """Resolve call for queue/agent AMI events using multiple identifiers."""
            ids = []
            for key in ('Linkedid', 'Uniqueid', 'DestUniqueid', 'Uniqueid1', 'Uniqueid2'):
                val = (event_dict.get(key, '') or '').strip()
                if val and val not in ids:
                    ids.append(val)

            if ids:
                call_obj = Call.objects.filter(uniqueid__in=ids).select_related('lead', 'agent').order_by('-created_at').first()
                if call_obj:
                    return call_obj

            # Fallback for queue events where AMI ids don't map 1:1 to stored uniqueid
            caller_raw = (event_dict.get('CallerIDNum', '') or event_dict.get('CallerID', '') or '').strip()
            queue_name = (event_dict.get('Queue', '') or '').strip()
            if not caller_raw and not queue_name:
                return None

            recent_qs = Call.objects.select_related('lead', 'agent').filter(
                direction='inbound',
                created_at__gte=timezone.now() - timedelta(minutes=15),
            )

            if queue_name:
                recent_qs = recent_qs.filter(queue=queue_name)

            if caller_raw:
                digits = ''.join(ch for ch in caller_raw if ch.isdigit())
                suffix = digits[-9:] if len(digits) >= 9 else digits
                if suffix:
                    recent_qs = recent_qs.filter(caller__endswith=suffix)

            return recent_qs.order_by('-created_at').first()

        # ── event handlers ────────────────────────────────────
        from apps.leads.models import Lead, LeadStage, LeadEvent

        if event_name == 'Newchannel':
            chan_name = event.get('Channel', '')
            if chan_name.startswith('Local/'):
                logger.debug(f'[AMI] Skipping Local channel: {chan_name}')
                return

            caller_num  = event.get('CallerIDNum', '')
            caller_name = _clean_caller_name(event.get('CallerIDName', ''))
            context    = event.get('Context', '')
            exten      = event.get('Exten', '')

            from django.conf import settings as _dj_settings
            INBOUND_CONTEXTS = set(getattr(_dj_settings, 'ASTERISK_INBOUND_CONTEXTS', [
                'from-trunk', 'from-pstn', 'from-did',
                'from-sip-external', 'ext-did', 'from-external',
                'from-did-direct', 'from-pstn-toheader',
            ]))
            if context not in INBOUND_CONTEXTS:
                logger.debug(f'[AMI] Newchannel skipped — context={context}')
                return

            caller       = caller_num
            callee       = exten
            direction    = 'inbound'

            lead = _find_lead(caller)

            call, created = Call.objects.get_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':      caller,
                    'caller_name': caller_name,
                    'callee':      callee,
                    'direction':   direction,
                    'status':      'ringing',
                    'lead':        lead,
                    'agent':       None,
                    'started_at':  timezone.now(),
                }
            )
            logger.info(f'[AMI] Newchannel result: caller={caller!r} caller_name={caller_name!r} lead={lead.id if lead else None} call_created={created}')
            if created:
                _create_call_activity(call, status='in_progress')
                notify_incoming_call.delay(str(call.id))
                logger.info(f'[AMI] New trunk call: {uniqueid} | {caller} → {callee}')

        elif event_name == 'QueueCallerJoin':
            caller      = event.get('CallerIDNum', '')
            caller_name = _clean_caller_name(event.get('CallerIDName', ''))
            queue       = event.get('Queue', '')

            lead = _find_lead(caller)

            call, created = Call.objects.update_or_create(
                uniqueid=uniqueid,
                defaults={
                    'caller':      caller,
                    'caller_name': caller_name,
                    'callee':      queue,
                    'direction':   'inbound',
                    'status':      'ringing',
                    'queue':       queue,
                    'lead':        lead,
                    'started_at':  timezone.now(),
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
            call_obj = Call.objects.filter(uniqueid=uniqueid).first() if uniqueid else None
            if not call_obj:
                call_obj = _resolve_call_from_event(event)

            if not call_obj:
                return

            if cause in cause_status_map:
                status = cause_status_map[cause]
            elif call_obj.status == 'answered':
                status = 'answered'
            else:
                # NOTE: removed blocking sleep — read latest state directly.
                # If race-conditions reappear, schedule a Celery retry instead.
                fresh = Call.objects.filter(uniqueid=uniqueid).values('status').first()
                if fresh and fresh['status'] == 'answered':
                    status = 'answered'
                else:
                    status = 'no_answer'

            if duration == 0 and call_obj.started_at and status == 'answered':
                delta = (now - call_obj.started_at).total_seconds()
                duration = max(0, int(delta))

            updated = 0
            if uniqueid:
                updated = Call.objects.filter(
                    uniqueid=uniqueid,
                    is_completed=False,
                ).update(
                    status=status,
                    ended_at=now,
                    duration=duration,
                )

            if not updated and call_obj:
                updated = Call.objects.filter(
                    pk=call_obj.pk,
                    is_completed=False,
                ).update(
                    status=status,
                    ended_at=now,
                    duration=duration,
                )

            if updated:
                call = None
                if uniqueid:
                    call = Call.objects.filter(uniqueid=uniqueid).select_related('lead', 'agent').first()
                if not call and call_obj:
                    call = Call.objects.filter(pk=call_obj.pk).select_related('lead', 'agent').first()
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

                    # Log timeout for ALL agents who were offered this call
                    # but never answered (find offered events with no matching answered)
                    if status == 'no_answer':
                        from .models import CallAgentEvent
                        events_qs = CallAgentEvent.objects.filter(call=call)
                        offered_agent_ids = set(events_qs.filter(
                            event_type='offered'
                        ).values_list('agent_id', flat=True))
                        answered_agent_ids = set(events_qs.filter(
                            event_type='answered'
                        ).values_list('agent_id', flat=True))
                        rejected_agent_ids = set(events_qs.filter(
                            event_type__in=('rejected', 'ringhangup', 'dismissed')
                        ).values_list('agent_id', flat=True))
                        timeout_agent_ids = set(events_qs.filter(
                            event_type='timeout'
                        ).values_list('agent_id', flat=True))

                        # Skip None and keep one timeout per agent max
                        target_agent_ids = {
                            aid for aid in offered_agent_ids
                            if aid and aid not in answered_agent_ids
                            and aid not in rejected_agent_ids
                            and aid not in timeout_agent_ids
                        }

                        # Did anyone actually answer this call?
                        someone_answered = bool(answered_agent_ids)

                        for agent_id in target_agent_ids:
                            offered_evt = events_qs.filter(
                                event_type='offered', agent_id=agent_id
                            ).select_related('agent').order_by('-created_at').first()
                            if not offered_evt or not offered_evt.agent:
                                continue
                            # If another agent answered, this isn't a "missed call" — log it differently
                            if someone_answered:
                                evt_type = 'taken_by_other'
                                evt_note = f'Call answered by another agent — {offered_evt.agent.get_full_name() if hasattr(offered_evt.agent, "get_full_name") else offered_evt.agent}'
                            else:
                                evt_type = 'timeout'
                                evt_note = f'No answer — {offered_evt.agent.get_full_name() if hasattr(offered_evt.agent, "get_full_name") else offered_evt.agent}'
                            _log_agent_event(
                                call,
                                offered_evt.agent,
                                evt_type,
                                ring_duration=offered_evt.ring_duration or duration,
                                note=evt_note,
                            )

                    notify_call_ended.delay(str(call.id), status)

                    # Missed call automation
                    if status == 'no_answer':
                        handle_missed_call.delay(str(call.id))

                logger.info(f'[AMI] Call ended: {uniqueid} → {status} (cause={cause}, duration={duration}s)')
            else:
                logger.warning(f'[AMI] Hangup not linked to call: uid={uniqueid} linkedid={event.get("Linkedid", "")} caller={event.get("CallerIDNum", "")}')

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
            linkedid    = event.get('Linkedid', '') or uniqueid
            try:
                agent, agent_candidates = _resolve_agent_from_event(event)
                if not agent:
                    logger.warning(f'[AMI] AgentCalled unresolved agent: member={event.get("MemberName", "")} interface={event.get("Interface", "")} cands={agent_candidates}')
                else:
                    call_obj = _resolve_call_from_event(event)
                    if call_obj:
                        Call.objects.filter(pk=call_obj.pk).update(agent=agent)
                        _log_agent_event(call_obj, agent, 'offered', note=f'Call offered to {event.get("MemberName", "") or event.get("Interface", "") or "agent"}')
                        logger.info(f'[AMI] AgentCalled: agent={agent} call={call_obj.uniqueid or linkedid}')
                    else:
                        logger.warning(f'[AMI] AgentCalled unresolved call: linkedid={linkedid} uniqueid={uniqueid} caller={event.get("CallerIDNum", "")}')
            except Exception as e:
                logger.debug(f'[AMI] AgentCalled error: {e}')

        elif event_name == 'AgentConnect':
            linkedid    = event.get('Linkedid', '') or uniqueid
            ring_time   = int(event.get('Ringtime', '0') or '0')
            try:
                agent, agent_candidates = _resolve_agent_from_event(event)
                if not agent:
                    logger.warning(f'[AMI] AgentConnect unresolved agent: member={event.get("MemberName", "")} interface={event.get("Interface", "")} cands={agent_candidates}')
                else:
                    call_obj = _resolve_call_from_event(event)
                    if call_obj:
                        Call.objects.filter(pk=call_obj.pk).update(
                            agent=agent,
                            status='answered',
                            started_at=timezone.now(),
                        )

                        call_obj = Call.objects.filter(pk=call_obj.pk).select_related('lead').first()
                        if call_obj:
                            _assign_lead_to_agent(call_obj, agent)
                            _log_agent_event(call_obj, agent, 'answered', ring_duration=ring_time,
                                             note=f'Answered by {event.get("MemberName", "") or event.get("Interface", "") or "agent"} after {ring_time}s')

                        from apps.users.services import update_user_status, _notify_status_change
                        update_user_status(str(agent.id), 'on_call')
                        _notify_status_change(agent, 'on_call')
                        resolved_uid = call_obj.uniqueid if call_obj else linkedid
                        logger.info(f'[AMI] AgentConnect: agent={agent} answered {resolved_uid}')
                    else:
                        logger.warning(f'[AMI] AgentConnect unresolved call: linkedid={linkedid} uniqueid={uniqueid} caller={event.get("CallerIDNum", "")}')
            except Exception as e:
                logger.debug(f'[AMI] AgentConnect error: {e}')

        elif event_name in ('AgentComplete', 'AgentRinghangup'):
            interface = event.get('Location', '') or event.get('Interface', '') or event.get('Member', '')
            member_name = event.get('MemberName', '')
            linkedid    = event.get('Linkedid', '') or uniqueid
            try:
                agent, agent_candidates = _resolve_agent_from_event(event)
                if not agent:
                    logger.warning(f'[AMI] {event_name} unresolved agent: member={member_name} interface={interface} cands={agent_candidates}')
                else:
                    from apps.users.services import update_user_status, _notify_status_change
                    update_user_status(str(agent.id), 'available')
                    _notify_status_change(agent, 'available')
                    logger.info(f'[AMI] Agent available again: {agent}')

                    if event_name == 'AgentRinghangup':
                        call_obj = _resolve_call_from_event(event)
                        if call_obj:
                            _log_agent_event(call_obj, agent, 'ringhangup',
                                             note=f'Agent {member_name or interface or agent} rejected (rang up while ringing)')
                        else:
                            logger.warning(f'[AMI] AgentRinghangup unresolved call: linkedid={linkedid} uniqueid={uniqueid}')
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
        # TODO[review]: replace threading+join with:
        #     async_to_sync(channel_layer.group_send)(group, {...})
        # See INCOMING_FLOW review fix #2.


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
