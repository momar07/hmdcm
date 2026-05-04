import logging
import threading
import os
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class AsteriskConfig(AppConfig):
    name = 'apps.asterisk'
    default_auto_field = 'django.db.models.BigAutoField'

    def ready(self):
        import os, sys
        # Skip during manage.py commands like migrate, makemigrations, collectstatic, test, shell
        skip_commands = {'migrate', 'makemigrations', 'collectstatic', 'test', 'shell'}
        if len(sys.argv) > 1 and sys.argv[1] in skip_commands:
            logger.info('[AMI] Skipping listener (management command)')
            return

        # Skip if explicitly disabled
        if os.environ.get('DISABLE_AMI') == '1':
            logger.info('[AMI] Listener disabled via DISABLE_AMI=1')
            return

        # Only start the AMI listener in the Daphne/web process, not in Celery workers.
        # Celery workers don't need their own AMI listener since events are dispatched
        # via apply_async() to the Celery queue from the Daphne process.
        if os.environ.get('AMI_STANDALONE') != '1':
            import threading
            is_celery = any('celery' in arg.lower() for arg in sys.argv)
            if is_celery:
                logger.info('[AMI] Skipping listener in Celery worker — events dispatched via queue')
                return

        self._start_ami_thread()

    def _start_ami_thread(self):
        try:
            from apps.asterisk.ami_client import AMIClient
            client = AMIClient()
            t = threading.Thread(target=client.run, daemon=True, name='ami-listener')
            t.start()
            logger.info('[AMI] Listener thread started ✅')
        except Exception as e:
            logger.error(f'[AMI] Failed to start listener: {e}')
