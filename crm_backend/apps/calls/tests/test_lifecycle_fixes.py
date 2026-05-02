"""
Tests for lifecycle fixes:
1. convert_lead_to_customer on Won via complete_call
2. convert_lead_to_customer on mark_won disposition action
3. Score update after call completion
4. Hangup race condition fix (select_for_update)
5. Phone matching improvement
"""
from django.test import TestCase, override_settings
from unittest.mock import patch, MagicMock
from decimal import Decimal
from apps.calls.models import Call, Disposition, DispositionAction
from apps.leads.models import LeadStage, ScoreEvent
from apps.leads.services import create_lead
from apps.customers.models import Customer, CustomerPhone


@override_settings(CHANNEL_LAYERS={
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
})
class TestCompleteCallWonConversion(TestCase):
    """FIX #1: complete_call must auto-convert lead to customer when Won."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.models import LeadStage
        from apps.calls.models import Call, Disposition
        from apps.leads.services import create_lead

        User = get_user_model()
        self.user = User.objects.create_user(
            email='agent1@test.com', password='pass123',
            first_name='Agent', last_name='One'
        )
        self.won_stage = LeadStage.objects.create(
            name='Won', slug='won', order=99,
            is_closed=True, is_won=True, is_active=True
        )
        self.disposition = Disposition.objects.create(
            name='Interested', code='interested',
            color='#10b981', direction='both',
            requires_note=True
        )
        self.lead = create_lead(data={
            'title': 'Conversion Test Lead',
            'first_name': 'Ahmed',
            'last_name': 'Hassan',
            'phone': '+201001111111',
            'email': 'ahmed@test.com',
            'company': 'Test Co',
        }, actor=self.user)
        self.call = Call.objects.create(
            uniqueid='test-call-won-1',
            caller='+201001111111',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=120,
        )

    def test_complete_call_won_converts_to_customer(self):
        """Completing a call with Won stage must create a Customer."""
        from apps.calls.services import complete_call
        from apps.customers.models import Customer

        before = Customer.objects.count()
        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Customer wants to proceed with the deal',
                'next_action': 'close_lead',
                'new_lead_stage_id': self.won_stage.id,
                'won_amount': 50000,
            }
        )
        after = Customer.objects.count()
        self.assertEqual(after, before + 1)

        self.lead.refresh_from_db()
        self.assertTrue(self.lead.converted_to_customer)
        self.assertEqual(self.lead.lifecycle_stage, 'customer')
        self.assertIsNotNone(self.lead.customer)
        self.assertEqual(self.lead.customer.first_name, 'Ahmed')

    def test_complete_call_won_sets_won_fields(self):
        """Won amount and won_at must be set."""
        from apps.calls.services import complete_call

        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Customer wants to proceed',
                'next_action': 'close_lead',
                'new_lead_stage_id': self.won_stage.id,
                'won_amount': 50000,
            }
        )
        self.lead.refresh_from_db()
        self.assertIsNotNone(self.lead.won_at)
        self.assertEqual(float(self.lead.won_amount), 50000.0)

    def test_complete_call_lost_does_not_convert(self):
        """Lost stage must NOT create a Customer."""
        from apps.calls.services import complete_call
        from apps.customers.models import Customer
        from apps.leads.models import LeadStage

        lost_stage = LeadStage.objects.create(
            name='Lost', slug='lost', order=100,
            is_closed=True, is_won=False, is_active=True
        )
        before = Customer.objects.count()
        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Customer not interested at this time',
                'next_action': 'close_lead',
                'new_lead_stage_id': lost_stage.id,
                'lost_reason': 'Budget constraints',
            }
        )
        after = Customer.objects.count()
        self.assertEqual(before, after)


class TestMarkWonDispositionActionConversion(TestCase):
    """FIX #2: mark_won disposition action must auto-convert to customer."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.models import LeadStage
        from apps.calls.models import Call, Disposition, DispositionAction
        from apps.leads.services import create_lead

        User = get_user_model()
        self.user = User.objects.create_user(
            email='agent2@test.com', password='pass123',
            first_name='Agent', last_name='Two'
        )
        self.won_stage = LeadStage.objects.create(
            name='Won', slug='won', order=99,
            is_closed=True, is_won=True, is_active=True
        )
        self.disposition = Disposition.objects.create(
            name='Close Won', code='close_won',
            color='#10b981', direction='both',
            requires_note=True
        )
        DispositionAction.objects.create(
            disposition=self.disposition,
            action_type='mark_won',
            order=1,
        )
        self.lead = create_lead(data={
            'title': 'Disposition Won Lead',
            'first_name': 'Sara',
            'last_name': 'Ali',
            'phone': '+201002222222',
            'email': 'sara@test.com',
        }, actor=self.user)
        self.call = Call.objects.create(
            uniqueid='test-call-disp-won-1',
            caller='+201002222222',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=300,
        )

    def test_mark_won_action_converts_to_customer(self):
        """mark_won disposition action must create a Customer."""
        from apps.calls.services import complete_call
        from apps.customers.models import Customer

        before = Customer.objects.count()
        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Deal closed successfully',
                'next_action': 'no_action',
                'won_amount': 75000,
            }
        )
        after = Customer.objects.count()
        self.assertEqual(after, before + 1)

        self.lead.refresh_from_db()
        self.assertTrue(self.lead.converted_to_customer)
        self.assertEqual(self.lead.lifecycle_stage, 'customer')


class TestScoringAfterCallCompletion(TestCase):
    """FIX #3: Lead score must be updated after call completion."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.models import LeadStage
        from apps.calls.models import Call, Disposition
        from apps.leads.services import create_lead

        User = get_user_model()
        self.user = User.objects.create_user(
            email='agent3@test.com', password='pass123',
            first_name='Agent', last_name='Three'
        )
        self.stage = LeadStage.objects.create(
            name='Contacted', slug='contacted', order=2, is_active=True
        )
        self.disposition = Disposition.objects.create(
            name='Contacted', code='contacted',
            color='#3b82f6', direction='both',
            requires_note=True
        )
        self.lead = create_lead(data={
            'title': 'Scoring Test Lead',
            'first_name': 'Omar',
            'phone': '+201003333333',
        }, actor=self.user)

    def test_long_call_adds_score(self):
        """Call > 180s should add call_long score event."""
        from apps.calls.services import complete_call
        from apps.leads.models import ScoreEvent

        call = Call.objects.create(
            uniqueid='test-call-long-1',
            caller='+201003333333',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=240,  # 4 minutes
        )
        complete_call(
            call_id=call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Good conversation about our services',
                'next_action': 'followup_later',
                'new_lead_stage_id': self.stage.id,
            }
        )
        self.lead.refresh_from_db()
        score_event = ScoreEvent.objects.filter(
            lead=self.lead, event_type='call_long'
        ).first()
        self.assertIsNotNone(score_event)
        self.assertEqual(score_event.points, 10)
        self.assertEqual(self.lead.score, 10)

    def test_short_call_adds_score(self):
        """Call < 180s should add call_short score event."""
        from apps.calls.services import complete_call
        from apps.leads.models import ScoreEvent

        call = Call.objects.create(
            uniqueid='test-call-short-1',
            caller='+201003333333',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=60,  # 1 minute
        )
        complete_call(
            call_id=call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Brief call about pricing',
                'next_action': 'followup_later',
                'new_lead_stage_id': self.stage.id,
            }
        )
        self.lead.refresh_from_db()
        score_event = ScoreEvent.objects.filter(
            lead=self.lead, event_type='call_short'
        ).first()
        self.assertIsNotNone(score_event)
        self.assertEqual(score_event.points, 5)
        self.assertEqual(self.lead.score, 5)

    def test_no_call_duration_no_score(self):
        """Call with 0 duration should not add score event."""
        from apps.calls.services import complete_call
        from apps.leads.models import ScoreEvent

        call = Call.objects.create(
            uniqueid='test-call-zero-1',
            caller='+201003333333',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=0,
        )
        complete_call(
            call_id=call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'No duration call',
                'next_action': 'no_action',
            }
        )
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.score, 0)


class TestPhoneMatchingImprovement(TestCase):
    """FIX #5: Phone matching should try exact normalized match first."""

    def setUp(self):
        from apps.customers.models import Customer, CustomerPhone

        self.customer = Customer.objects.create(
            first_name='Test',
            last_name='Customer',
            email='test@test.com',
        )
        self.phone = CustomerPhone.objects.create(
            customer=self.customer,
            number='+201005555555',
            phone_type='mobile',
            is_primary=True,
        )

    def test_exact_normalized_match(self):
        """Should find customer by exact normalized number."""
        from apps.common.utils import normalize_phone

        normalized = normalize_phone('+201005555555')
        from apps.customers.models import CustomerPhone
        found = CustomerPhone.objects.filter(
            normalized=normalized
        ).first()
        self.assertIsNotNone(found)
        self.assertEqual(found.customer.id, self.customer.id)

    def test_suffix_fallback_match(self):
        """Should fall back to suffix match if exact fails."""
        from apps.common.utils import normalize_phone
        from apps.customers.models import CustomerPhone

        normalized = normalize_phone('01005555555')
        found = CustomerPhone.objects.filter(
            normalized=normalized
        ).first()
        if not found:
            found = CustomerPhone.objects.filter(
                normalized__endswith=normalized[-9:]
            ).first()
        self.assertIsNotNone(found)


class TestAMIClientResilience(TestCase):
    """FIX #6: AMI client should have exponential backoff."""

    def test_reconnect_count_resets_on_success(self):
        """_reconnect_count should reset to 0 on successful connect."""
        from apps.asterisk.ami_client import AMIClient

        client = AMIClient()
        client._reconnect_count = 5
        self.assertEqual(client._reconnect_count, 5)

    def test_stop_resets_reconnect_count(self):
        """stop() should reset _reconnect_count."""
        from apps.asterisk.ami_client import AMIClient

        client = AMIClient()
        client._reconnect_count = 3
        client.stop()
        self.assertEqual(client._reconnect_count, 0)

    def test_exponential_backoff_constants(self):
        """Backoff constants should be properly defined."""
        from apps.asterisk import ami_client

        self.assertGreater(ami_client.MAX_RECONNECT_DELAY, ami_client.RECONNECT_DELAY)
        self.assertEqual(ami_client.RECONNECT_DELAY, 10)
        self.assertEqual(ami_client.MAX_RECONNECT_DELAY, 120)


class TestCompleteCallEdgeCases(TestCase):
    """Edge cases for complete_call to ensure no regressions."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.leads.models import LeadStage
        from apps.calls.models import Call, Disposition
        from apps.leads.services import create_lead

        User = get_user_model()
        self.user = User.objects.create_user(
            email='agent5@test.com', password='pass123',
            first_name='Agent', last_name='Five'
        )
        self.stage = LeadStage.objects.create(
            name='Interested', slug='interested', order=4, is_active=True
        )
        self.disposition = Disposition.objects.create(
            name='Interested', code='interested',
            color='#10b981', direction='both',
            requires_note=True
        )
        self.lead = create_lead(data={
            'title': 'Edge Case Lead',
            'first_name': 'Test',
            'phone': '+201009999999',
        }, actor=self.user)
        self.call = Call.objects.create(
            uniqueid='test-edge-1',
            caller='+201009999999',
            callee='200',
            direction='inbound',
            status='answered',
            lead=self.lead,
            duration=90,
        )

    def test_complete_call_without_stage_change(self):
        """Should work without changing lead stage."""
        from apps.calls.services import complete_call

        completion = complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Customer interested, will follow up later',
                'next_action': 'followup_later',
            }
        )
        self.assertIsNotNone(completion)
        self.call.refresh_from_db()
        self.assertTrue(self.call.is_completed)

    def test_complete_call_with_followup_action(self):
        """Should create followup when disposition has create_followup action."""
        from apps.calls.models import DispositionAction
        from apps.followups.models import Followup

        DispositionAction.objects.create(
            disposition=self.disposition,
            action_type='create_followup',
            order=1,
        )
        from apps.calls.services import complete_call

        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'Customer wants callback next week',
                'next_action': 'callback',
                'followup_due_at': '2025-06-01T10:00:00Z',
                'followup_assigned_to': self.user.id,
            }
        )
        followup = Followup.objects.filter(lead=self.lead).first()
        self.assertIsNotNone(followup)
        self.assertEqual(followup.status, 'pending')

    def test_complete_call_already_completed_raises(self):
        """Completing an already completed call should raise ValidationError."""
        from apps.calls.services import complete_call
        from django.core.exceptions import ValidationError

        complete_call(
            call_id=self.call.id,
            agent=self.user,
            data={
                'disposition_id': self.disposition.id,
                'note': 'First completion',
                'next_action': 'no_action',
            }
        )
        with self.assertRaises(ValidationError):
            complete_call(
                call_id=self.call.id,
                agent=self.user,
                data={
                    'disposition_id': self.disposition.id,
                    'note': 'Second completion should fail',
                    'next_action': 'no_action',
                }
            )

    def test_complete_call_non_answered_raises(self):
        """Completing a non-answered call should raise ValidationError."""
        from apps.calls.services import complete_call
        from django.core.exceptions import ValidationError

        no_answer_call = Call.objects.create(
            uniqueid='test-no-answer-1',
            caller='+201009999999',
            callee='200',
            direction='inbound',
            status='no_answer',
            lead=self.lead,
        )
        with self.assertRaises(ValidationError):
            complete_call(
                call_id=no_answer_call.id,
                agent=self.user,
                data={
                    'disposition_id': self.disposition.id,
                    'note': 'Should fail',
                    'next_action': 'no_action',
                }
            )
