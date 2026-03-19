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
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')
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

    # VICIdial integration fields
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
        base = getattr(settings, 'VICIDIAL_URL', '')
        if not base or not self.vicidial_user:
            return None
        params = (
            f'?phone_login={self.number}'
            f'&phone_pass={self.secret or self.number}'
            f'&VD_login={self.vicidial_user or self.number}'
            f'&VD_pass={self.vicidial_pass or self.number}'
            f'&VD_campaign={self.vicidial_campaign or getattr(settings, "VICIDIAL_CAMPAIGN", "")}'
            f'&VD_ingroup={self.vicidial_ingroup or getattr(settings, "VICIDIAL_INGROUP", "")}'
            f'&auto_login=YES'
        )
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
