from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import (
    SalesSettingsView, TermsTemplateViewSet,
    ProductViewSet, QuotationViewSet,
)

router = SimpleRouter()
router.register(r"settings",        SalesSettingsView,      basename="sales-settings")
router.register(r"terms-templates", TermsTemplateViewSet,   basename="terms-template")
router.register(r"products",        ProductViewSet,         basename="product")
router.register(r"quotations",      QuotationViewSet,       basename="quotation")

urlpatterns = [
    path("", include(router.urls)),
]
