from rest_framework import serializers
from django.utils   import timezone
from .models import (
    SalesSettings, TermsTemplate,
    Product, ProductDimensionField, ProductVariant,
    Quotation, QuotationItem, QuotationField, QuotationLog,
)


# ── SalesSettings ─────────────────────────────────────────────
class SalesSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SalesSettings
        fields = [
            "id", "enable_price_quotation", "enable_contract",
            "company_name", "company_logo", "company_address",
            "default_currency", "default_tax_rate",
            "quotation_prefix", "next_quotation_number",
        ]
        read_only_fields = ["id", "next_quotation_number"]


# ── TermsTemplate ─────────────────────────────────────────────
class TermsTemplateSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model  = TermsTemplate
        fields = [
            "id", "name", "category", "body",
            "is_active", "created_by", "created_by_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ""


# ── Product ───────────────────────────────────────────────────
class ProductDimensionFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductDimensionField
        fields = ["id", "label", "unit", "order"]


class ProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ProductVariant
        fields = ["id", "name", "price", "is_active"]


class ProductSerializer(serializers.ModelSerializer):
    dimension_fields = ProductDimensionFieldSerializer(many=True, read_only=True)
    variants         = ProductVariantSerializer(many=True, read_only=True)
    created_by_name  = serializers.SerializerMethodField()

    class Meta:
        model  = Product
        fields = [
            "id", "name", "description", "sku", "category",
            "pricing_type", "base_price", "unit", "currency",
            "is_active", "created_by", "created_by_name",
            "dimension_fields", "variants",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() if obj.created_by else ""


class ProductWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Product
        fields = [
            "name", "description", "sku", "category",
            "pricing_type", "base_price", "unit", "currency", "is_active",
        ]


# ── Quotation ─────────────────────────────────────────────────
class QuotationItemSerializer(serializers.ModelSerializer):
    product_name = serializers.SerializerMethodField()

    class Meta:
        model  = QuotationItem
        fields = [
            "id", "product", "product_name",
            "description", "qty", "unit_price",
            "discount_pct", "line_total",
            "dimensions", "note", "order",
        ]
        read_only_fields = ["id", "line_total"]

    def get_product_name(self, obj):
        return obj.product.name if obj.product else ""


class QuotationFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model  = QuotationField
        fields = ["id", "key", "value", "order"]
        read_only_fields = ["id"]


class QuotationLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model  = QuotationLog
        fields = ["id", "action", "detail", "actor_name", "created_at"]

    def get_actor_name(self, obj):
        return obj.actor.get_full_name() if obj.actor else "System"


class QuotationSerializer(serializers.ModelSerializer):
    items         = QuotationItemSerializer(many=True, read_only=True)
    fields_data   = QuotationFieldSerializer(many=True, read_only=True, source="fields")
    logs          = QuotationLogSerializer(many=True, read_only=True)
    agent_name    = serializers.SerializerMethodField()
    lead_name     = serializers.SerializerMethodField()
    lead_title    = serializers.SerializerMethodField()
    is_expired    = serializers.SerializerMethodField()

    class Meta:
        model  = Quotation
        fields = [
            "id", "ref_number", "version", "parent",
            "quotation_type", "status", "title",
            "agent", "agent_name",
            "lead", "lead_name", "lead_title",
            "currency", "tax_rate",
            "subtotal", "tax_amount", "total_amount",
            "valid_until", "terms_body", "internal_note",
            "approval",
            "reviewed_by", "reviewed_at", "review_comment",
            "items", "fields_data", "logs",
            "is_expired",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "ref_number", "version", "parent",
            "subtotal", "tax_amount", "total_amount",
            "approval", "reviewed_by", "reviewed_at",
            "created_at", "updated_at",
        ]

    def get_agent_name(self, obj):
        return obj.agent.get_full_name() if obj.agent else ""

    def get_lead_name(self, obj):
        return obj.lead.get_display_name() if obj.lead else ""

    def get_lead_title(self, obj):
        return obj.lead.get_display_name() if obj.lead else ""

    def get_is_expired(self, obj):
        if obj.valid_until and obj.status not in ("accepted", "rejected", "expired"):
            from datetime import date
            return date.today() > obj.valid_until
        return False


class QuotationCreateSerializer(serializers.ModelSerializer):
    items       = QuotationItemSerializer(many=True, required=False)
    fields_data = QuotationFieldSerializer(many=True, required=False)

    class Meta:
        model  = Quotation
        fields = [
            "quotation_type", "title",
            "lead",
            "currency", "tax_rate", "valid_until",
            "terms_body", "internal_note",
            "items", "fields_data",
        ]

    def create(self, validated_data):
        items_data  = validated_data.pop("items", [])
        fields_data = validated_data.pop("fields_data", [])
        quotation   = Quotation.objects.create(**validated_data)

        for i, item in enumerate(items_data):
            item.pop('order', None)
            QuotationItem.objects.create(quotation=quotation, order=i, **item)

        for i, field in enumerate(fields_data):
            field.pop('order', None)
            QuotationField.objects.create(quotation=quotation, order=i, **field)

        quotation.recalculate_totals()
        return quotation

    def update(self, instance, validated_data):
        items_data  = validated_data.pop("items", None)
        fields_data = validated_data.pop("fields_data", None)

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if items_data is not None:
            instance.items.all().delete()
            for i, item in enumerate(items_data):
                item.pop('order', None)
                QuotationItem.objects.create(quotation=instance, order=i, **item)

        if fields_data is not None:
            instance.fields.all().delete()
            for i, field in enumerate(fields_data):
                field.pop('order', None)
                QuotationField.objects.create(quotation=instance, order=i, **field)

        instance.recalculate_totals()
        return instance
