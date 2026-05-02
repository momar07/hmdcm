"""
API tests for leads endpoints.
Tests: create lead without customer_id,
       mark-won endpoint, mark-lost endpoint, timeline endpoint.
"""
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status


class LeadAPITestCase(TestCase):
    """Base setup for lead API tests."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.models import LeadStage
        User = get_user_model()
        self.user = User.objects.create_user(
            email='api@test.com', password='apipass123',
            first_name='API', last_name='Agent'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Create pipeline stages
        self.stage_new = LeadStage.objects.create(
            name='New', slug='new', order=1, is_active=True
        )
        self.stage_won = LeadStage.objects.create(
            name='Won', slug='won', order=99,
            is_closed=True, is_won=True, is_active=True
        )
        self.stage_lost = LeadStage.objects.create(
            name='Lost', slug='lost', order=100,
            is_closed=True, is_won=False, is_active=True
        )


class TestLeadCreateAPI(LeadAPITestCase):
    """POST /api/leads/ — create without customer."""

    def test_create_lead_without_customer_id(self):
        """Should create lead with only name and phone."""
        res = self.client.post('/api/leads/', {
            'title':      'API Test Lead',
            'first_name': 'Khaled',
            'last_name':  'Mostafa',
            'phone':      '+201006666666',
            'source':     'manual',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertIn('id', data)
        self.assertFalse(data.get('converted_to_customer', True))

    def test_create_lead_with_value(self):
        """Lead with monetary value should be created correctly."""
        res = self.client.post('/api/leads/', {
            'title':      'Valuable Lead',
            'first_name': 'Nour',
            'phone':      '+201007777777',
            'source':     'call',
            'value':      25000,
        }, format='json')
        self.assertIn(res.status_code,
                      [status.HTTP_201_CREATED, status.HTTP_200_OK])

    def test_create_lead_unauthenticated(self):
        """Unauthenticated request should be rejected."""
        client = APIClient()
        res = client.post('/api/leads/', {
            'first_name': 'Anonymous',
            'phone':      '+201008888888',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class TestMarkWonAPI(LeadAPITestCase):
    """POST /api/leads/{id}/mark-won/"""

    def setUp(self):
        super().setUp()
        from apps.leads.services import create_lead
        self.lead = create_lead(data={
            'title':      'Mark Won API Test',
            'first_name': 'Yasmin',
            'phone':      '+201009999990',
            'value':      20000,
        }, actor=self.user)

    def test_mark_won_returns_200(self):
        """mark-won endpoint should return 200 with customer_id."""
        res = self.client.post(
            f'/api/leads/{self.lead.id}/mark-won/',
            {'won_amount': 20000},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('customer_id', data)
        self.assertIn('lead_id', data)
        self.assertEqual(data['status'], 'won')

    def test_mark_won_creates_customer_in_db(self):
        """After mark-won a Customer must exist in DB."""
        from apps.customers.models import Customer
        before = Customer.objects.count()
        self.client.post(
            f'/api/leads/{self.lead.id}/mark-won/',
            {'won_amount': 20000},
            format='json'
        )
        self.assertEqual(Customer.objects.count(), before + 1)

    def test_mark_won_with_no_amount(self):
        """mark-won without amount should still succeed."""
        res = self.client.post(
            f'/api/leads/{self.lead.id}/mark-won/',
            {},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class TestMarkLostAPI(LeadAPITestCase):
    """POST /api/leads/{id}/mark-lost/"""

    def setUp(self):
        super().setUp()
        from apps.leads.services import create_lead
        self.lead = create_lead(data={
            'title': 'Mark Lost API Test',
            'phone': '+201001111110',
        }, actor=self.user)

    def test_mark_lost_returns_200(self):
        """mark-lost endpoint should return 200."""
        res = self.client.post(
            f'/api/leads/{self.lead.id}/mark-lost/',
            {'lost_reason': 'No budget'},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertEqual(data['status'], 'lost')

    def test_mark_lost_requires_reason(self):
        """mark-lost without reason should return 400."""
        res = self.client.post(
            f'/api/leads/{self.lead.id}/mark-lost/',
            {},
            format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mark_lost_does_not_create_customer(self):
        """mark-lost must not create a Customer."""
        from apps.customers.models import Customer
        before = Customer.objects.count()
        self.client.post(
            f'/api/leads/{self.lead.id}/mark-lost/',
            {'lost_reason': 'Wrong contact'},
            format='json'
        )
        self.assertEqual(Customer.objects.count(), before)


class TestTimelineAPI(LeadAPITestCase):
    """GET /api/leads/{id}/timeline/"""

    def setUp(self):
        super().setUp()
        from apps.leads.services import create_lead
        self.lead = create_lead(data={
            'title': 'Timeline API Test',
            'phone': '+201002222220',
        }, actor=self.user)

    def test_timeline_returns_200(self):
        """Timeline endpoint should return 200 with count and results."""
        res = self.client.get(f'/api/leads/{self.lead.id}/timeline/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('count', data)
        self.assertIn('results', data)
        self.assertIsInstance(data['results'], list)

    def test_timeline_includes_creation_event(self):
        """Timeline should include at least the creation event."""
        res = self.client.get(f'/api/leads/{self.lead.id}/timeline/')
        data = res.json()
        self.assertGreater(data['count'], 0)
