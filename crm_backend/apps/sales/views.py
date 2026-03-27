from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response   import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import (
    SalesSettings, TermsTemplate,
    Product, ProductDimensionField, ProductVariant,
    Quotation, QuotationItem, QuotationField,
)
from .serializers import (
    SalesSettingsSerializer, TermsTemplateSerializer,
    ProductSerializer, ProductWriteSerializer,
    ProductDimensionFieldSerializer, ProductVariantSerializer,
    QuotationSerializer, QuotationCreateSerializer,
    QuotationItemSerializer, QuotationFieldSerializer,
)
from . import services


class IsSupervisorOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.role in ("supervisor", "admin")


# ── SalesSettings ─────────────────────────────────────────────
class SalesSettingsView(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        obj = SalesSettings.get()
        return Response(SalesSettingsSerializer(obj).data)

    @action(detail=False, methods=["patch"], url_path="update",
            permission_classes=[IsSupervisorOrAdmin])
    def update_settings(self, request):
        obj = SalesSettings.get()
        ser = SalesSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


# ── TermsTemplate ─────────────────────────────────────────────
class TermsTemplateViewSet(viewsets.ModelViewSet):
    queryset           = TermsTemplate.objects.filter(is_active=True)
    serializer_class   = TermsTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [SearchFilter, OrderingFilter]
    search_fields      = ["name", "category"]
    ordering_fields    = ["name", "created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = TermsTemplate.objects.all()
        if self.request.query_params.get("active_only") == "true":
            qs = qs.filter(is_active=True)
        return qs


# ── Product ───────────────────────────────────────────────────
class ProductViewSet(viewsets.ModelViewSet):
    queryset           = Product.objects.prefetch_related("dimension_fields", "variants")
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ["pricing_type", "category", "is_active"]
    search_fields      = ["name", "sku", "category"]
    ordering_fields    = ["name", "base_price", "created_at"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        return ProductSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"], url_path="dimension-fields",
            permission_classes=[IsSupervisorOrAdmin])
    def add_dimension_field(self, request, pk=None):
        product = self.get_object()
        ser = ProductDimensionFieldSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(product=product)
        return Response(ser.data, status=201)

    @action(detail=True, methods=["post"], url_path="variants",
            permission_classes=[IsSupervisorOrAdmin])
    def add_variant(self, request, pk=None):
        product = self.get_object()
        ser = ProductVariantSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(product=product)
        return Response(ser.data, status=201)


# ── Quotation ─────────────────────────────────────────────────
class QuotationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields   = ["status", "quotation_type", "agent", "customer"]
    search_fields      = ["ref_number", "title"]
    ordering_fields    = ["created_at", "total_amount", "valid_until"]
    ordering           = ["-created_at"]

    def get_queryset(self):
        user = self.request.user
        qs   = Quotation.objects.select_related(
                   "agent", "customer", "lead", "approval"
               ).prefetch_related("items", "fields", "logs__actor")
        if user.role == "agent":
            qs = qs.filter(agent=user)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return QuotationCreateSerializer
        return QuotationSerializer

    def perform_create(self, serializer):
        ref = services.generate_ref_number()
        serializer.save(agent=self.request.user, ref_number=ref)

    # ── Workflow actions ──────────────────────────────────────
    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        quotation = self.get_object()
        try:
            services.submit_for_approval(quotation, request.user)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        return Response(QuotationSerializer(quotation).data)

    @action(detail=True, methods=["post"], url_path="approve",
            permission_classes=[IsSupervisorOrAdmin])
    def approve(self, request, pk=None):
        quotation = self.get_object()
        comment   = request.data.get("comment", "")
        services.approve_quotation(quotation, request.user, comment)
        return Response(QuotationSerializer(quotation).data)

    @action(detail=True, methods=["post"], url_path="reject",
            permission_classes=[IsSupervisorOrAdmin])
    def reject(self, request, pk=None):
        quotation = self.get_object()
        comment   = request.data.get("comment", "")
        if not comment:
            return Response({"detail": "Comment required for rejection."}, status=400)
        services.reject_quotation(quotation, request.user, comment)
        return Response(QuotationSerializer(quotation).data)

    @action(detail=True, methods=["post"], url_path="request-revision",
            permission_classes=[IsSupervisorOrAdmin])
    def request_revision(self, request, pk=None):
        quotation = self.get_object()
        comment   = request.data.get("comment", "")
        if not comment:
            return Response({"detail": "Comment required for revision request."}, status=400)
        services.request_revision(quotation, request.user, comment)
        return Response(QuotationSerializer(quotation).data)

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request, pk=None):
        quotation = self.get_object()
        try:
            services.mark_sent(quotation, request.user)
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        return Response(QuotationSerializer(quotation).data)

    @action(detail=True, methods=["get"], url_path="whatsapp-link")
    def whatsapp_link(self, request, pk=None):
        quotation = self.get_object()
        phone = None
        if quotation.customer:
            from apps.customers.models import CustomerPhone
            p = CustomerPhone.objects.filter(
                customer=quotation.customer, is_primary=True
            ).first() or CustomerPhone.objects.filter(
                customer=quotation.customer
            ).first()
            phone = p.normalized or p.number if p else None

        if not phone:
            return Response({"detail": "No phone number for customer."}, status=400)

        lines = [f"📄 Quotation {quotation.ref_number}"]
        if quotation.customer:
            lines.append(f"Customer: {quotation.customer.get_full_name()}")
        if quotation.quotation_type == "price_quote":
            lines.append(f"Total: {quotation.total_amount:,.2f} {quotation.currency}")
        if quotation.valid_until:
            lines.append(f"Valid Until: {quotation.valid_until}")

        import urllib.parse
        text = urllib.parse.quote("\n".join(lines))
        url  = f"https://wa.me/{phone.lstrip('+').replace(' ','')}?text={text}"
        return Response({"url": url, "phone": phone})

    @action(detail=True, methods=["get"], url_path="render-terms")
    def render_terms(self, request, pk=None):
        quotation = self.get_object()
        rendered  = services.render_terms(quotation.terms_body, quotation)
        return Response({"rendered": rendered})
