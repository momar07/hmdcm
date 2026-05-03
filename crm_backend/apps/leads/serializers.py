from rest_framework import serializers
from .models import Lead, LeadStatus, LeadPriority, LeadStage, LeadEvent, LeadTag


class LeadTagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadTag
        fields = '__all__'


class LeadStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadStatus
        fields = '__all__'


class LeadPrioritySerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadPriority
        fields = '__all__'


class LeadStageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LeadStage
        fields = ['id', 'name', 'slug', 'order', 'color',
                  'is_closed', 'is_won', 'is_active']
        read_only_fields = ['id']


class LeadListSerializer(serializers.ModelSerializer):
    status_name   = serializers.CharField(source='status.name',   read_only=True)
    priority_name = serializers.CharField(source='priority.name', read_only=True)
    assigned_name = serializers.CharField(
        source='assigned_to.get_full_name', read_only=True
    )
    stage_name  = serializers.CharField(source='stage.name',  read_only=True)
    stage_color = serializers.CharField(source='stage.color', read_only=True)
    stage_slug  = serializers.CharField(source='stage.slug',  read_only=True)
    tags        = LeadTagSerializer(many=True, read_only=True)

    class Meta:
        model  = Lead
        fields = [
            'id', 'title', 'phone', 'first_name', 'last_name', 'company',
            'status',   'status_name',
            'priority', 'priority_name',
            'stage',    'stage_name', 'stage_color', 'stage_slug',
            'source',   'assigned_to', 'assigned_name',
            'value',    'followup_date', 'tags',
            'is_active', 'created_at', 'updated_at',
        ]


class LeadDetailSerializer(serializers.ModelSerializer):
    status_detail    = LeadStatusSerializer(source='status',      read_only=True)
    priority_detail  = LeadPrioritySerializer(source='priority',  read_only=True)
    stage_detail     = LeadStageSerializer(source='stage',        read_only=True)
    status_name      = serializers.CharField(source='status.name',   read_only=True)
    priority_name    = serializers.CharField(source='priority.name', read_only=True)
    assigned_name    = serializers.CharField(
        source='assigned_to.get_full_name', read_only=True
    )
    stage_name       = serializers.CharField(source='stage.name',  read_only=True)
    stage_color      = serializers.CharField(source='stage.color', read_only=True)
    stage_slug       = serializers.CharField(source='stage.slug',  read_only=True)
    tags             = LeadTagSerializer(many=True, read_only=True)

    status_id    = serializers.UUIDField(write_only=True, allow_null=True, required=False)
    priority_id  = serializers.UUIDField(write_only=True, allow_null=True, required=False)
    stage_id     = serializers.UUIDField(write_only=True, allow_null=True, required=False)
    tag_ids      = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )

    class Meta:
        model  = Lead
        fields = [
            'id', 'title', 'phone', 'first_name', 'last_name', 'email',
            'gender', 'date_of_birth', 'company', 'address', 'city', 'country',
            'status_id', 'priority_id', 'stage_id', 'tag_ids',
            'status_detail',   'status_name',
            'priority_detail', 'priority_name',
            'stage_detail',    'stage_name', 'stage_color', 'stage_slug',
            'source', 'assigned_to', 'assigned_name', 'campaign',
            'description', 'notes', 'value', 'followup_date', 'tags',
            'won_at', 'lost_at', 'won_amount', 'lost_reason',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def _get_obj(self, Model, uid, field):
        if uid is None:
            return None
        try:
            return Model.objects.get(pk=uid)
        except Model.DoesNotExist:
            raise serializers.ValidationError({field: f'{field} not found.'})

    def create(self, validated_data):
        from .models import LeadStatus, LeadPriority

        status_id    = validated_data.pop('status_id',   None)
        priority_id  = validated_data.pop('priority_id', None)
        stage_id     = validated_data.pop('stage_id',    None)
        tag_ids      = validated_data.pop('tag_ids',     None)

        validated_data['status']   = self._get_obj(LeadStatus,   status_id,    'status_id')
        validated_data['priority'] = self._get_obj(LeadPriority, priority_id,  'priority_id')
        validated_data['stage']    = self._get_obj(LeadStage,    stage_id,     'stage_id')

        request = self.context.get('request')
        if not validated_data.get('assigned_to') and request:
            validated_data['assigned_to'] = request.user

        lead = Lead.objects.create(**validated_data)

        if tag_ids:
            tags = LeadTag.objects.filter(id__in=tag_ids)
            lead.tags.set(tags)

        return lead

    def update(self, instance, validated_data):
        from .models import LeadStatus, LeadPriority

        if 'status_id' in validated_data:
            instance.status = self._get_obj(
                LeadStatus, validated_data.pop('status_id'), 'status_id')
        if 'priority_id' in validated_data:
            instance.priority = self._get_obj(
                LeadPriority, validated_data.pop('priority_id'), 'priority_id')
        if 'stage_id' in validated_data:
            instance.stage = self._get_obj(
                LeadStage, validated_data.pop('stage_id'), 'stage_id')
        if 'tag_ids' in validated_data:
            tag_ids = validated_data.pop('tag_ids')
            tags = LeadTag.objects.filter(id__in=tag_ids)
            instance.tags.set(tags)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        return instance


class LeadEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(
        source='actor.get_full_name', read_only=True, default=None
    )

    class Meta:
        model  = LeadEvent
        fields = [
            'id', 'event_type', 'actor_name',
            'old_value', 'new_value', 'note', 'created_at',
        ]
