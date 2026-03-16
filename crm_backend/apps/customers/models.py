import uuid
from django.db import models
from apps.common.models import BaseModel, TimeStampedModel


class CustomerTag(TimeStampedModel):
    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name  = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#6366f1')

    class Meta:
        db_table = 'customer_tags'
        ordering = ['name']

    def __str__(self):
        return self.name


class Customer(BaseModel):
    GENDER_CHOICES = [('M', 'Male'), ('F', 'Female'), ('O', 'Other')]

    first_name   = models.CharField(max_length=150, db_index=True)
    last_name    = models.CharField(max_length=150, db_index=True)
    email        = models.EmailField(blank=True, db_index=True)
    gender       = models.CharField(max_length=1, choices=GENDER_CHOICES, blank=True)
    date_of_birth= models.DateField(null=True, blank=True)
    address      = models.TextField(blank=True)
    city         = models.CharField(max_length=100, blank=True)
    country      = models.CharField(max_length=100, default='Egypt')
    company      = models.CharField(max_length=200, blank=True)
    notes        = models.TextField(blank=True)
    tags         = models.ManyToManyField(CustomerTag, blank=True, related_name='customers')
    assigned_to  = models.ForeignKey(
        'users.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='assigned_customers'
    )
    is_active    = models.BooleanField(default=True)
    source       = models.CharField(max_length=100, blank=True,
                                    help_text='Where this customer came from')

    class Meta:
        db_table = 'customers'
        ordering = ['first_name', 'last_name']
        indexes = [
            models.Index(fields=['first_name', 'last_name']),
        ]

    def __str__(self):
        return f'{self.first_name} {self.last_name}'

    def get_full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def primary_phone(self):
        phone = self.phones.filter(is_primary=True).first()
        return phone.number if phone else None


class CustomerPhone(TimeStampedModel):
    PHONE_TYPE_CHOICES = [
        ('mobile',  'Mobile'),
        ('home',    'Home'),
        ('work',    'Work'),
        ('fax',     'Fax'),
        ('other',   'Other'),
    ]

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer   = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='phones')
    number     = models.CharField(max_length=30, db_index=True)
    normalized = models.CharField(max_length=30, db_index=True, blank=True,
                                  help_text='E.164 normalized number')
    phone_type = models.CharField(max_length=10, choices=PHONE_TYPE_CHOICES, default='mobile')
    is_primary = models.BooleanField(default=False)
    is_active  = models.BooleanField(default=True)

    class Meta:
        db_table = 'customer_phones'
        ordering = ['-is_primary', 'phone_type']
        unique_together = [('customer', 'number')]

    def __str__(self):
        return f'{self.number} ({self.customer})'

    def save(self, *args, **kwargs):
        from apps.common.utils import normalize_phone
        self.normalized = normalize_phone(self.number)
        super().save(*args, **kwargs)
