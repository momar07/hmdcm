import logging
from celery import shared_task

log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def complete_login_sequence(self, user_id: str, session_id: str):
    """
    Phase 2 of agent login:
    After QueueAdd + LOGIN break, wait 5 seconds then unpause and set available.
    """
    try:
        from apps.users.models import User, AgentBreak
        from apps.users.agent_state_service import _get_interface, _get_queues, _run_ami, _notify
        from apps.users.services import update_user_status
        from django.utils import timezone

        user = User.objects.select_related('extension').get(pk=user_id)
        interface = _get_interface(user)
        queues    = _get_queues(user)

        # Close the LOGIN break record
        AgentBreak.objects.filter(
            agent_id=user_id,
            reason='LOGIN',
            break_end__isnull=True,
        ).update(break_end=timezone.now())

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
            log.info(f'[LoginSeq] {user.email} unpaused after LOGIN break')

        update_user_status(user_id, 'available')
        _notify(user, 'available')
        log.info(f'[LoginSeq] {user.email} → available (login sequence complete)')

    except Exception as exc:
        log.error(f'[LoginSeq] Error for user {user_id}: {exc}')
        raise self.retry(exc=exc, countdown=3)
