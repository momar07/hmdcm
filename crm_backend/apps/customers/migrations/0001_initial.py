import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('users', '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='CustomerTag',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name',       models.CharField(max_length=100, unique=True)),
                ('color',      models.CharField(default='#6366f1', max_length=7)),
            ],
            options={'db_table': 'customer_tags', 'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='Customer',
            fields=[
                ('id',            models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',    models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',    models.DateTimeField(auto_now=True)),
                ('first_name',    models.CharField(db_index=True, max_length=150)),
                ('last_name',     models.CharField(db_index=True, max_length=150)),
                ('email',         models.EmailField(blank=True, db_index=True)),
                ('gender',        models.CharField(blank=True, choices=[('M','Male'),('F','Female'),('O','Other')], max_length=1)),
                ('date_of_birth', models.DateField(blank=True, null=True)),
                ('address',       models.TextField(blank=True)),
                ('city',          models.CharField(blank=True, max_length=100)),
                ('country',       models.CharField(default='Egypt', max_length=100)),
                ('company',       models.CharField(blank=True, max_length=200)),
                ('notes',         models.TextField(blank=True)),
                ('is_active',     models.BooleanField(default=True)),
                ('source',        models.CharField(blank=True, max_length=100)),
                ('assigned_to',   models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assigned_customers',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('tags',          models.ManyToManyField(blank=True, related_name='customers', to='customers.customertag')),
            ],
            options={
                'db_table': 'customers',
                'ordering': ['first_name', 'last_name'],
                'indexes': [models.Index(fields=['first_name', 'last_name'], name='customers_name_idx')],
            },
        ),
        migrations.CreateModel(
            name='CustomerPhone',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer',   models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='phones', to='customers.customer')),
                ('number',     models.CharField(db_index=True, max_length=30)),
                ('normalized', models.CharField(blank=True, db_index=True, max_length=30)),
                ('phone_type', models.CharField(
                    choices=[('mobile','Mobile'),('home','Home'),('work','Work'),('fax','Fax'),('other','Other')],
                    default='mobile', max_length=10,
                )),
                ('is_primary', models.BooleanField(default=False)),
                ('is_active',  models.BooleanField(default=True)),
            ],
            options={
                'db_table': 'customer_phones',
                'ordering': ['-is_primary', 'phone_type'],
                'unique_together': {('customer', 'number')},
            },
        ),
    ]
