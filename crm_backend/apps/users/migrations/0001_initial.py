import uuid
import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth',  '0012_alter_user_first_name_max_length'),
        ('teams', '0001_initial'),
    ]
    operations = [
        migrations.CreateModel(
            name='User',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',   models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',   models.DateTimeField(auto_now=True)),
                ('password',     models.CharField(max_length=128, verbose_name='password')),
                ('last_login',   models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, verbose_name='superuser status')),
                ('email',        models.EmailField(db_index=True, unique=True)),
                ('first_name',   models.CharField(max_length=100)),
                ('last_name',    models.CharField(max_length=100)),
                ('role',         models.CharField(
                    choices=[('admin','Admin'),('supervisor','Supervisor'),('agent','Agent'),('qa','QA')],
                    db_index=True, default='agent', max_length=20,
                )),
                ('status',       models.CharField(
                    choices=[('available','Available'),('busy','Busy'),('away','Away'),('offline','Offline'),('on_call','On Call')],
                    default='offline', max_length=20,
                )),
                ('avatar',       models.ImageField(blank=True, null=True, upload_to='avatars/')),
                ('phone',        models.CharField(blank=True, max_length=20)),
                ('team',         models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='members',
                    to='teams.team',
                )),
                ('is_active',    models.BooleanField(default=True)),
                ('is_staff',     models.BooleanField(default=False)),
            ],
            options={'db_table': 'users', 'ordering': ['first_name', 'last_name']},
        ),
        migrations.AddField(
            model_name='user',
            name='groups',
            field=models.ManyToManyField(
                blank=True, related_name='user_set', related_query_name='user',
                to='auth.group', verbose_name='groups',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='user_permissions',
            field=models.ManyToManyField(
                blank=True, related_name='user_set', related_query_name='user',
                to='auth.permission', verbose_name='user permissions',
            ),
        ),
        migrations.CreateModel(
            name='Extension',
            fields=[
                ('id',        models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',models.DateTimeField(auto_now=True)),
                ('user',      models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='extension', to='users.user')),
                ('number',    models.CharField(db_index=True, max_length=20, unique=True)),
                ('peer_name', models.CharField(blank=True, max_length=100)),
                ('is_active', models.BooleanField(default=True)),
                ('secret',    models.CharField(blank=True, max_length=100)),
            ],
            options={'db_table': 'extensions'},
        ),
        migrations.CreateModel(
            name='Queue',
            fields=[
                ('id',           models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at',   models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at',   models.DateTimeField(auto_now=True)),
                ('name',         models.CharField(max_length=100, unique=True)),
                ('display_name', models.CharField(blank=True, max_length=200)),
                ('strategy',     models.CharField(default='ringall', max_length=50)),
                ('is_active',    models.BooleanField(default=True)),
                ('description',  models.TextField(blank=True)),
            ],
            options={'db_table': 'queues'},
        ),
    ]
