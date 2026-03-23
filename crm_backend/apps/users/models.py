import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from apps.common.models import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    ROLE_CHOICES = [
        ('admin',      'Admin'),
        ('supervisor', 'Supervisor'),
        ('agent',      'Agent'),
        ('qa',         'QA'),
    ]
    STATUS_CHOICES = [
        ('available', 'Available'),
        ('busy',      'Busy'),
        ('away',      'Away'),
        ('offline',   'Offline'),
        ('on_call',   'On Call'),
    ]

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email      = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name  = models.CharField(max_length=100)
    role       = models.CharField(max_length=20, choices=ROLE_CHOICES, default='agent', db_index=True)
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')
    status_since = models.DateTimeField(null=True, blank=True, help_text='When the current status started')
    avatar     = models.ImageField(upload_to='avatars/', null=True, blank=True)
    phone      = models.CharField(max_length=20, blank=True)
    team       = models.ForeignKey('teams.Team', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='members')
    is_active  = models.BooleanField(default=True)
    is_staff   = models.BooleanField(default=False)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']
    objects = UserManager()

    class Meta:
        db_table = 'users'
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f'{self.get_full_name()} ({self.role})'

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class Extension(TimeStampedModel):
    """SIP/IAX extension assigned to an agent."""
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user      = models.OneToOneField(User, on_delete=models.CASCADE, related_name='extension')
    number    = models.CharField(max_length=20, unique=True, db_index=True)
    peer_name = models.CharField(max_length=100, blank=True, help_text='Asterisk peer name')
    is_active = models.BooleanField(default=True)
    secret    = models.CharField(max_length=100, blank=True)
    queues    = models.ManyToManyField(
                    'Queue',
                    blank=True,
                    related_name='members',
                    help_text='Asterisk queues this agent belongs to',
                )

    # VICIdial integration fields (kept for backwards compatibility)
    vicidial_user     = models.CharField(max_length=50,  blank=True,
                                         help_text='VICIdial username (usually same as extension number)')
    vicidial_pass     = models.CharField(max_length=100, blank=True,
                                         help_text='VICIdial user password')
    vicidial_campaign = models.CharField(max_length=50,  blank=True,
                                         help_text='VICIdial campaign ID (e.g. 2000)')
    vicidial_ingroup  = models.CharField(max_length=50,  blank=True,
                                         help_text='VICIdial ingroup ID (e.g. 901)')

    class Meta:
        db_table = 'extensions'

    def __str__(self):
        return f'Ext {self.number} → {self.user}'

    @property
    def vicidial_login_url(self):
        """Build the full vicidial.php login URL for this agent."""
        from django.conf import settings
        base = getattr(settings, 'VICIDIAL_URL', '').rstrip('/')
        if not base or not self.number:
            return None
        phone_pass = self.secret or self.number
        vd_pass    = self.vicidial_pass or self.secret or self.number
        vd_user    = self.vicidial_user or self.number
        campaign   = self.vicidial_campaign or getattr(settings, 'VICIDIAL_CAMPAIGN', '')
        ingroup    = self.vicidial_ingroup  # only use DB value — ignore settings fallback

        params = (
            f'?phone_login={self.number}'
            f'&phone_pass={phone_pass}'
            f'&VD_login={vd_user}'
            f'&VD_pass={vd_pass}'
            f'&VD_campaign={campaign}'
            f'&auto_login=YES'
        )
        # add ingroup only if set
        if ingroup:
            params += f'&VD_ingroup={ingroup}'

        return f'{base}/agc/vicidial.php{params}'


class Queue(TimeStampedModel):
    """Asterisk call queue."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name         = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=200, blank=True)
    strategy     = models.CharField(max_length=50, default='ringall')
    is_active    = models.BooleanField(default=True)
    description  = models.TextField(blank=True)

    class Meta:
        db_table = 'queues'

    def __str__(self):
        return self.name


class AgentSession(models.Model):
    """Tracks each agent login/logout session."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    agent      = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    login_at   = models.DateTimeField(auto_now_add=True)
    logout_at  = models.DateTimeField(null=True, blank=True)
    login_ip   = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = 'agent_sessions'
        ordering = ['-login_at']

    def __str__(self):
        return f'{self.agent.get_full_name()} — {self.login_at}'

    @property
    def duration_seconds(self):
        if self.logout_at and self.login_at:
            return int((self.logout_at - self.login_at).total_seconds())
        return None


class AgentBreak(models.Model):
    """Tracks each break taken during an agent session."""
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session     = models.ForeignKey(AgentSession, on_delete=models.CASCADE,
                                    related_name='breaks', null=True, blank=True)
    agent       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='breaks')
    break_start = models.DateTimeField(auto_now_add=True)
    break_end   = models.DateTimeField(null=True, blank=True)
    reason      = models.CharField(max_length=100, default='Break')

    class Meta:
        db_table = 'agent_breaks'
        ordering = ['-break_start']

    def __str__(self):
        return f'{self.agent.get_full_name()} — {self.reason} @ {self.break_start}'

    @property
    def duration_seconds(self):
        if self.break_end and self.break_start:
            return int((self.break_end - self.break_start).total_seconds())
        return None
