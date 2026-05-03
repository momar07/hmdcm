import uuid
from django.db   import models
from django.conf import settings
from apps.common.models import BaseModel


# ══════════════════════════════════════════════════════════════
#  SALES SETTINGS  (one row per company)
# ══════════════════════════════════════════════════════════════
class SalesSettings(models.Model):
    """Company-level sales configuration — singleton (id=1)."""
    enable_price_quotation = models.BooleanField(default=True)
    enable_contract        = models.BooleanField(default=False)

    # Company branding used in print view
    company_name    = models.CharField(max_length=255, blank=True)
    company_logo    = models.ImageField(upload_to="sales/logos/", null=True, blank=True)
    company_address = models.TextField(blank=True)

    # Quotation defaults
    default_currency      = models.CharField(max_length=10, default="EGP")
    default_tax_rate      = models.DecimalField(max_digits=5, decimal_places=2, default=14.00)
    quotation_prefix      = models.CharField(max_length=10, default="QUO")
    next_quotation_number = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "sales_settings"

    def __str__(self):
        return "Sales Settings"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


# ══════════════════════════════════════════════════════════════
#  TERMS TEMPLATE
# ══════════════════════════════════════════════════════════════
class TermsTemplate(BaseModel):
    """
    Reusable terms & conditions templates.
    Body supports placeholders: {{customer_name}}, {{total_amount}},
    {{valid_until}}, {{agent_name}} — plus any custom field keys
    from Contract quotations e.g. {{plot_number}}.
    """
    CATEGORY_CHOICES = [
        ("standard", "Standard"),
        ("premium",  "Premium"),
        ("real_estate", "Real Estate"),
        ("legal",    "Legal"),
        ("other",    "Other"),
    ]

    name       = models.CharField(max_length=255)
    category   = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default="standard")
    body       = models.TextField(help_text="Use {{placeholder}} for dynamic values")
    is_active  = models.BooleanField(default=True)
    created_by = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL,
                   null=True, blank=True,
                   related_name="terms_templates",
                 )

    class Meta:
        db_table = "sales_terms_templates"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.category})"


# ══════════════════════════════════════════════════════════════
#  PRODUCT
# ══════════════════════════════════════════════════════════════
class Product(BaseModel):
    PRICING_TYPE_CHOICES = [
        ("fixed",    "Fixed Price"),
        ("per_unit", "Per Unit (m², ml, kg, hr …)"),
        ("variants", "Has Variants"),
    ]
    UNIT_CHOICES = [
        ("piece", "Piece"),
        ("m2",    "m²"),
        ("ml",    "ml"),
        ("kg",    "kg"),
        ("hour",  "Hour"),
        ("other", "Other"),
    ]

    name         = models.CharField(max_length=255, db_index=True)
    description  = models.TextField(blank=True)
    sku          = models.CharField(max_length=100, blank=True, db_index=True)
    category     = models.CharField(max_length=100, blank=True, db_index=True)
    pricing_type = models.CharField(max_length=10, choices=PRICING_TYPE_CHOICES, default="fixed")
    base_price   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit         = models.CharField(max_length=10, choices=UNIT_CHOICES, default="piece")
    currency     = models.CharField(max_length=10, default="EGP")
    is_active    = models.BooleanField(default=True, db_index=True)
    created_by   = models.ForeignKey(
                     settings.AUTH_USER_MODEL,
                     on_delete=models.SET_NULL,
                     null=True, blank=True,
                     related_name="products",
                   )

    class Meta:
        db_table = "sales_products"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.get_pricing_type_display()})"


class ProductDimensionField(models.Model):
    """
    Defines which dimension inputs appear on a quotation line item
    when product.pricing_type == 'per_unit'.
    e.g. Width (m), Height (m) → area = width × height → price = area × base_price
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="dimension_fields")
    label   = models.CharField(max_length=50)   # e.g. "Width"
    unit    = models.CharField(max_length=20)   # e.g. "m"
    order   = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "sales_product_dimension_fields"
        ordering = ["order"]

    def __str__(self):
        return f"{self.product.name} — {self.label} ({self.unit})"


class ProductVariant(BaseModel):
    """
    Predefined size/spec options when product.pricing_type == 'variants'.
    e.g. Wooden Door 80x200 cm → 1,200 EGP
    """
    product   = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    name      = models.CharField(max_length=100)   # e.g. "80x200 cm"
    price     = models.DecimalField(max_digits=12, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "sales_product_variants"
        ordering = ["name"]

    def __str__(self):
        return f"{self.product.name} — {self.name}: {self.price}"


# ══════════════════════════════════════════════════════════════
#  QUOTATION
# ══════════════════════════════════════════════════════════════
class Quotation(BaseModel):
    QUOTATION_TYPE_CHOICES = [
        ("price_quote", "Price Quotation"),
        ("contract",    "Contract / Agreement"),
    ]
    STATUS_CHOICES = [
        ("draft",            "Draft"),
        ("pending_approval", "Pending Approval"),
        ("approved",         "Approved"),
        ("sent",             "Sent"),
        ("accepted",         "Accepted"),
        ("rejected",         "Rejected"),
        ("expired",          "Expired"),
        ("revision",         "Revision Requested"),
    ]

    # ── Type & Identity ──────────────────────────────────────
    quotation_type = models.CharField(max_length=15, choices=QUOTATION_TYPE_CHOICES, default="price_quote", db_index=True)
    ref_number     = models.CharField(max_length=30, unique=True, db_index=True)
    version        = models.PositiveSmallIntegerField(default=1)
    parent         = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="revisions")

    # ── Status ───────────────────────────────────────────────
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft", db_index=True)

    # ── Title (used for contracts) ───────────────────────────
    title          = models.CharField(max_length=255, blank=True)

    # ── People ───────────────────────────────────────────────
    agent          = models.ForeignKey(
                       settings.AUTH_USER_MODEL,
                       on_delete=models.SET_NULL, null=True,
                       related_name="quotations",
                     )
    lead           = models.ForeignKey(
                       "leads.Lead",
                       on_delete=models.SET_NULL, null=True, blank=True,
                       related_name="quotations",
                     )

    # ── Financials (price_quote only) ────────────────────────
    currency       = models.CharField(max_length=10, default="EGP")
    tax_rate       = models.DecimalField(max_digits=5, decimal_places=2, default=14.00)
    subtotal       = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount     = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # ── Dates ────────────────────────────────────────────────
    valid_until    = models.DateField(null=True, blank=True)

    # ── Terms & Notes ────────────────────────────────────────
    terms_body     = models.TextField(blank=True, help_text="Rendered terms after placeholder substitution")
    internal_note  = models.TextField(blank=True)

    # ── Approval link ────────────────────────────────────────
    approval       = models.OneToOneField(
                       "approvals.ApprovalRequest",
                       on_delete=models.SET_NULL,
                       null=True, blank=True,
                       related_name="quotation",
                     )

    # ── Supervisor review ────────────────────────────────────
    reviewed_by    = models.ForeignKey(
                       settings.AUTH_USER_MODEL,
                       on_delete=models.SET_NULL, null=True, blank=True,
                       related_name="reviewed_quotations",
                     )
    reviewed_at    = models.DateTimeField(null=True, blank=True)
    review_comment = models.TextField(blank=True)

    class Meta:
        db_table = "sales_quotations"
        ordering = ["-created_at"]
        indexes  = [
            models.Index(fields=["status", "-created_at"], name="idx_quot_status_created"),
            models.Index(fields=["agent", "status"],       name="idx_quot_agent_status"),
            models.Index(fields=["lead"],                  name="idx_quot_lead"),
        ]


    def recalculate_totals(self):
        """Recalculate subtotal/tax/total from line items."""
        from decimal import Decimal
        if self.quotation_type != "price_quote":
            return
        subtotal = sum(item.line_total for item in self.items.all())
        tax      = subtotal * (self.tax_rate / Decimal("100"))
        self.subtotal     = subtotal
        self.tax_amount   = tax
        self.total_amount = subtotal + tax
        self.save(update_fields=["subtotal", "tax_amount", "total_amount"])
    def __str__(self):
        return f"{self.ref_number} — {self.get_status_display()}"


# ══════════════════════════════════════════════════════════════
#  QUOTATION ITEMS  (price_quote only)
# ══════════════════════════════════════════════════════════════
class QuotationItem(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation  = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="items")
    product    = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)

    # Agent can type a custom description even without a product
    description   = models.CharField(max_length=255, blank=True)
    qty           = models.DecimalField(max_digits=10, decimal_places=3, default=1)
    unit_price    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_pct  = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    line_total    = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    # Dimension values stored as JSON — e.g. {"width": 1.5, "height": 2.0}
    dimensions    = models.JSONField(default=dict, blank=True)
    note          = models.CharField(max_length=255, blank=True)
    order         = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "sales_quotation_items"
        ordering = ["order"]

    def save(self, *args, **kwargs):
        """Auto-calculate line_total before saving."""
        from decimal import Decimal
        price     = self.unit_price or Decimal("0")
        qty       = self.qty or Decimal("0")
        disc      = self.discount_pct or Decimal("0")
        self.line_total = qty * price * (1 - disc / 100)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.quotation.ref_number} — {self.description or self.product}"


# ══════════════════════════════════════════════════════════════
#  CONTRACT FIELDS  (contract only)
# ══════════════════════════════════════════════════════════════
class QuotationField(models.Model):
    """
    Dynamic key-value pairs for Contract quotations.
    e.g. {"Plot Number": "42"}, {"Area (m²)": "500"}
    These values are also available as placeholders in terms_body.
    """
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="fields")
    key       = models.CharField(max_length=100)
    value     = models.TextField(blank=True)
    order     = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "sales_quotation_fields"
        ordering = ["order"]

    def __str__(self):
        return f"{self.quotation.ref_number} — {self.key}: {self.value}"


# ══════════════════════════════════════════════════════════════
#  QUOTATION LOG  (audit trail)
# ══════════════════════════════════════════════════════════════
class QuotationLog(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quotation  = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name="logs")
    actor      = models.ForeignKey(
                   settings.AUTH_USER_MODEL,
                   on_delete=models.SET_NULL, null=True, blank=True,
                 )
    action     = models.CharField(max_length=100)
    detail     = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "sales_quotation_logs"
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.quotation.ref_number}] {self.action}"
