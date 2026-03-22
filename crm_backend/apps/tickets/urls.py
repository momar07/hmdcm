from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    TicketViewSet,
    TagViewSet,
    SLAPolicyViewSet,
    TicketDashboardView,
    TicketScreenPopView,
)

router = DefaultRouter()
router.register(r"tickets",     TicketViewSet,    basename="ticket")
router.register(r"tags",        TagViewSet,       basename="ticket-tag")
router.register(r"sla-policies", SLAPolicyViewSet, basename="sla-policy")

urlpatterns = [
    path("dashboard/",  TicketDashboardView.as_view(),  name="ticket-dashboard"),
    path("screen-pop/", TicketScreenPopView.as_view(),  name="ticket-screen-pop"),
    path("",            include(router.urls)),
]
