"""
Unit tests for leads/services.py
Tests: create_lead, mark_won, mark_lost,
       convert_lead_to_customer, find_lead_by_phone
"""
from django.test import TestCase
from unittest.mock import patch, MagicMock


class TestCreateLead(TestCase):
    """Test create_lead() — no customer required."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(
            username='agent1', password='pass123',
            email='agent@test.com'
        )

    def test_create_lead_without_customer(self):
        """Lead can be created with only name and phone."""
        from apps.leads.services import create_lead
        lead = create_lead(data={
            'title':      'Test Lead',
            'first_name': 'Ahmed',
            'last_name':  'Hassan',
            'phone':      '+201001234567',
            'source':     'manual',
        }, actor=self.user)

        self.assertIsNotNone(lead.id)
        self.assertIsNone(lead.customer)
        self.assertEqual(lead.first_name, 'Ahmed')
        self.assertEqual(lead.phone, '+201001234567')
        self.assertFalse(lead.converted_to_customer)

    def test_create_lead_creates_event(self):
        """Creating a lead should log a LeadEvent."""
        from apps.leads.services import create_lead
        from apps.leads.models import LeadEvent
        lead = create_lead(data={
            'title': 'Event Test Lead',
            'phone': '+201009999999',
        }, actor=self.user)
        event = LeadEvent.objects.filter(lead=lead, event_type='created').first()
        self.assertIsNotNone(event)

    def test_create_lead_minimal_data(self):
        """Lead can be created with only a phone number."""
        from apps.leads.services import create_lead
        lead = create_lead(data={'phone': '+201111111111'})
        self.assertIsNotNone(lead.id)
        self.assertEqual(lead.source, 'manual')
        self.assertEqual(lead.lifecycle_stage, 'lead')


class TestConvertLeadToCustomer(TestCase):
    """Test convert_lead_to_customer()."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.services import create_lead
        User = get_user_model()
        self.user = User.objects.create_user(
            username='agent2', password='pass123',
            email='agent2@test.com'
        )
        self.lead = create_lead(data={
            'title':      'Conversion Test',
            'first_name': 'Sara',
            'last_name':  'Ali',
            'phone':      '+201002222222',
            'email':      'sara@test.com',
            'company':    'Test Co',
        }, actor=self.user)

    def test_convert_creates_customer(self):
        """Conversion should create a Customer linked to the Lead."""
        from apps.leads.services import convert_lead_to_customer
        from apps.customers.models import Customer
        customer = convert_lead_to_customer(self.lead.id, actor=self.user)
        self.assertIsNotNone(customer)
        self.assertIsInstance(customer, Customer)
        self.assertEqual(customer.first_name, 'Sara')
        self.assertEqual(customer.email, 'sara@test.com')

    def test_convert_marks_lead_converted(self):
        """Lead should be marked as converted after conversion."""
        from apps.leads.services import convert_lead_to_customer
        convert_lead_to_customer(self.lead.id, actor=self.user)
        self.lead.refresh_from_db()
        self.assertTrue(self.lead.converted_to_customer)
        self.assertIsNotNone(self.lead.converted_at)
        self.assertEqual(self.lead.lifecycle_stage, 'customer')

    def test_convert_idempotent(self):
        """Calling convert twice should return same customer."""
        from apps.leads.services import convert_lead_to_customer
        c1 = convert_lead_to_customer(self.lead.id, actor=self.user)
        c2 = convert_lead_to_customer(self.lead.id, actor=self.user)
        self.assertEqual(c1.id, c2.id)

    def test_convert_adds_phone_to_customer(self):
        """Customer should have the lead phone as primary phone."""
        from apps.leads.services import convert_lead_to_customer
        from apps.customers.models import CustomerPhone
        customer = convert_lead_to_customer(self.lead.id, actor=self.user)
        phone = CustomerPhone.objects.filter(customer=customer, is_primary=True).first()
        self.assertIsNotNone(phone)


class TestMarkWon(TestCase):
    """Test mark_won()."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.services import create_lead
        from apps.leads.models import LeadStage
        User = get_user_model()
        self.user = User.objects.create_user(
            username='agent3', password='pass123',
            email='agent3@test.com'
        )
        # Create a WON stage
        LeadStage.objects.create(
            name='Won', slug='won', order=99,
            is_closed=True, is_won=True, is_active=True
        )
        self.lead = create_lead(data={
            'title':      'Won Test Lead',
            'first_name': 'Omar',
            'last_name':  'Khalil',
            'phone':      '+201003333333',
            'value':      10000,
        }, actor=self.user)

    def test_mark_won_returns_lead_and_customer(self):
        """mark_won should return dict with lead and customer."""
        from apps.leads.services import mark_won
        result = mark_won(self.lead.id, won_amount=15000, actor=self.user)
        self.assertIn('lead', result)
        self.assertIn('customer', result)
        self.assertIsNotNone(result['customer'])

    def test_mark_won_sets_won_fields(self):
        """Lead won_at and won_amount should be set."""
        from apps.leads.services import mark_won
        mark_won(self.lead.id, won_amount=15000, actor=self.user)
        self.lead.refresh_from_db()
        self.assertIsNotNone(self.lead.won_at)
        self.assertEqual(float(self.lead.won_amount), 15000.0)

    def test_mark_won_creates_customer(self):
        """mark_won must auto-create a customer."""
        from apps.leads.services import mark_won
        from apps.customers.models import Customer
        before = Customer.objects.count()
        mark_won(self.lead.id, actor=self.user)
        after = Customer.objects.count()
        self.assertEqual(after, before + 1)


class TestMarkLost(TestCase):
    """Test mark_lost()."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.services import create_lead
        from apps.leads.models import LeadStage
        User = get_user_model()
        self.user = User.objects.create_user(
            username='agent4', password='pass123',
            email='agent4@test.com'
        )
        LeadStage.objects.create(
            name='Lost', slug='lost', order=100,
            is_closed=True, is_won=False, is_active=True
        )
        self.lead = create_lead(data={
            'title': 'Lost Test Lead',
            'phone': '+201004444444',
        }, actor=self.user)

    def test_mark_lost_closes_lead(self):
        """Lost lead should have is_active=False."""
        from apps.leads.services import mark_lost
        mark_lost(self.lead.id, lost_reason='Price too high', actor=self.user)
        self.lead.refresh_from_db()
        self.assertFalse(self.lead.is_active)
        self.assertEqual(self.lead.lost_reason, 'Price too high')
        self.assertIsNotNone(self.lead.lost_at)

    def test_mark_lost_does_not_create_customer(self):
        """Lost lead must NOT create a customer."""
        from apps.leads.services import mark_lost
        from apps.customers.models import Customer
        before = Customer.objects.count()
        mark_lost(self.lead.id, lost_reason='No budget', actor=self.user)
        after = Customer.objects.count()
        self.assertEqual(before, after)


class TestFindLeadByPhone(TestCase):
    """Test find_lead_by_phone()."""

    def setUp(self):
        from apps.leads.services import create_lead
        self.lead = create_lead(data={
            'title': 'Phone Search Lead',
            'phone': '+201005555555',
        })

    def test_find_by_exact_phone(self):
        """Should find lead by exact phone."""
        from apps.calls.services import find_lead_by_phone
        found = find_lead_by_phone('+201005555555')
        self.assertIsNotNone(found)
        self.assertEqual(found.id, self.lead.id)

    def test_find_by_suffix(self):
        """Should find lead by last 9 digits."""
        from apps.calls.services import find_lead_by_phone
        found = find_lead_by_phone('005555555')
        self.assertIsNotNone(found)

    def test_not_found_returns_none(self):
        """Unknown phone should return None."""
        from apps.calls.services import find_lead_by_phone
        found = find_lead_by_phone('+200000000000')
        self.assertIsNone(found)
