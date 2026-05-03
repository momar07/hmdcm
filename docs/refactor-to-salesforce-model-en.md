# Refactoring HMDM CRM to Salesforce Model

## Objective

Restructure the system from a HubSpot-like model (Customer-first) to a Salesforce model (Lead-first), where **Lead** is the primary entry point, and **Customer** (Account + Contact) is only created when a qualified Lead is converted.

---

## Current Model vs Target Model

### Current (HubSpot-like)
```
Call → Customer (match) → Lead (opportunity) → Won/Lost
```

### Target (Salesforce-like)
```
Lead (unqualified) → (qualify) → Qualified Lead → (convert) → Account + Contact + Opportunity → Won
```

---

## Part One: Backend (Django)

### 1. Redefining Models

#### 1.1 Lead Model — Becomes the Primary Entity

```python
# apps/leads/models.py

class Lead(BaseModel):
    """
    Salesforce-style Lead: First point of contact.
    A person/company that is not yet confirmed as a customer — needs qualification.
    """

    # ── Contact Information (merged from Customer) ──
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=50)
    mobile = models.CharField(max_length=50, blank=True)
    company = models.CharField(max_length=200, blank=True)
    title = models.CharField(max_length=100, blank=True)  # Job title
    website = models.URLField(blank=True)

    # ── Qualification Information ──
    status = models.ForeignKey(LeadStatus, on_delete=models.PROTECT)
    stage = models.ForeignKey(LeadStage, on_delete=models.PROTECT)
    priority = models.ForeignKey(LeadPriority, on_delete=models.PROTECT, null=True, blank=True)
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES)
    industry = models.CharField(max_length=100, blank=True)
    annual_revenue = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    number_of_employees = models.PositiveIntegerField(null=True, blank=True)

    # ── Address ──
    street = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)

    # ── Relationships ──
    assigned_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='assigned_leads')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_leads')
    campaign = models.ForeignKey('campaigns.Campaign', on_delete=models.SET_NULL, null=True, blank=True)
    originating_call = models.ForeignKey('calls.Call', on_delete=models.SET_NULL, null=True, blank=True)

    # ── Conversion ──
    is_converted = models.BooleanField(default=False)
    converted_date = models.DateTimeField(null=True, blank=True)
    converted_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='converted_leads')
    converted_account = models.ForeignKey('customers.Account', on_delete=models.SET_NULL, null=True, blank=True)
    converted_contact = models.ForeignKey('customers.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    converted_opportunity = models.ForeignKey('leads.Opportunity', on_delete=models.SET_NULL, null=True, blank=True)

    # ── Scoring ──
    lead_score = models.PositiveIntegerField(default=0)
    rating = models.CharField(max_length=20, choices=[('hot', 'Hot'), ('warm', 'Warm'), ('cold', 'Cold')], default='cold')

    # ── Business Values ──
    expected_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    won_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    lost_reason = models.TextField(blank=True)

    # ── Timestamps ──
    last_activity_at = models.DateTimeField(null=True, blank=True)
```

#### 1.2 New Model: Account (Company/Organization)

```python
# apps/customers/models.py

class Account(BaseModel):
    """
    Salesforce-style Account: The company or organization.
    Created when a qualified Lead is converted.
    """
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=50, choices=[
        ('prospect', 'Prospect'),
        ('customer', 'Customer'),
        ('partner', 'Partner'),
        ('reseller', 'Reseller'),
    ], default='prospect')
    industry = models.CharField(max_length=100, blank=True)
    annual_revenue = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    number_of_employees = models.PositiveIntegerField(null=True, blank=True)
    website = models.URLField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    fax = models.CharField(max_length=50, blank=True)

    # Billing Address
    billing_street = models.CharField(max_length=255, blank=True)
    billing_city = models.CharField(max_length=100, blank=True)
    billing_state = models.CharField(max_length=100, blank=True)
    billing_postal_code = models.CharField(max_length=20, blank=True)
    billing_country = models.CharField(max_length=100, blank=True)

    # Shipping Address
    shipping_street = models.CharField(max_length=255, blank=True)
    shipping_city = models.CharField(max_length=100, blank=True)
    shipping_state = models.CharField(max_length=100, blank=True)
    shipping_postal_code = models.CharField(max_length=20, blank=True)
    shipping_country = models.CharField(max_length=100, blank=True)

    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='owned_accounts')
    parent_account = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='child_accounts')
    description = models.TextField(blank=True)

    source_lead = models.ForeignKey('leads.Lead', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['name']
```

#### 1.3 New Model: Contact (Person within the Company)

```python
# apps/customers/models.py

class Contact(BaseModel):
    """
    Salesforce-style Contact: A specific person within an Account.
    Created when a qualified Lead is converted.
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='contacts')

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True)
    mobile = models.CharField(max_length=50, blank=True)
    title = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)

    # Mailing Address (may differ from Account address)
    mailing_street = models.CharField(max_length=255, blank=True)
    mailing_city = models.CharField(max_length=100, blank=True)
    mailing_state = models.CharField(max_length=100, blank=True)
    mailing_postal_code = models.CharField(max_length=20, blank=True)
    mailing_country = models.CharField(max_length=100, blank=True)

    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='owned_contacts')
    source_lead = models.ForeignKey('leads.Lead', on_delete=models.SET_NULL, null=True, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']
```

#### 1.4 New Model: Opportunity (Sales Deal)

```python
# apps/leads/models.py

class Opportunity(BaseModel):
    """
    Salesforce-style Opportunity: An active sales deal.
    Created when a qualified Lead is converted.
    This is the real pipeline entity — not the Lead.
    """
    name = models.CharField(max_length=200)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='opportunities')
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, related_name='opportunities')

    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    close_date = models.DateField(null=True, blank=True)
    stage = models.ForeignKey(LeadStage, on_delete=models.PROTECT, related_name='opportunities')
    probability = models.PositiveIntegerField(help_text="Expected close probability %")

    type = models.CharField(max_length=50, choices=[
        ('new_business', 'New Business'),
        ('existing_business', 'Existing Business'),
        ('replacement', 'Replacement'),
    ], default='new_business')

    lead_source = models.CharField(max_length=50, blank=True)
    next_step = models.TextField(blank=True)

    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='owned_opportunities')
    source_lead = models.ForeignKey('Lead', on_delete=models.SET_NULL, null=True, blank=True)
    campaign = models.ForeignKey('campaigns.Campaign', on_delete=models.SET_NULL, null=True, blank=True)

    is_closed = models.BooleanField(default=False)
    is_won = models.BooleanField(default=False)
    closed_date = models.DateField(null=True, blank=True)
    lost_reason = models.TextField(blank=True)

    description = models.TextField(blank=True)

    class Meta:
        ordering = ['-close_date']
```

#### 1.5 Deprecate or Remove the Old Customer Model

```python
# apps/customers/models.py

# The old Customer model is deprecated and will be removed.
# All FKs that pointed to Customer should be updated:
#   - calls.Call.customer → Call.contact (FK to Contact)
#   - tickets.Ticket.customer → Ticket.contact
#   - followups.Followup.customer → Followup.contact
#   - notes.Note.customer → Note.contact
```

---

### 2. Lead Conversion Service

```python
# apps/leads/services.py

from django.db import transaction
from django.utils import timezone

class LeadConversionError(Exception):
    pass

def convert_lead(lead, create_account=True, create_contact=True, create_opportunity=True,
                 account_name=None, contact_first_name=None, contact_last_name=None,
                 opportunity_name=None, opportunity_amount=None, opportunity_close_date=None,
                 converted_by=None):
    """
    Convert a Lead into Account + Contact + Opportunity (Salesforce model).

    Mirrors the Salesforce Lead Conversion flow:
    - Lead is split into 3 separate entities
    - Original Lead is marked converted=True and locked
    - All related data is migrated to the new entities
    """

    if lead.is_converted:
        raise LeadConversionError("This Lead has already been converted")

    with transaction.atomic():
        account = None
        contact = None
        opportunity = None

        # ── 1. Create Account ──
        if create_account:
            account = Account.objects.create(
                name=account_name or lead.company or f"{lead.first_name} {lead.last_name}",
                account_type='prospect',
                industry=lead.industry,
                annual_revenue=lead.annual_revenue,
                number_of_employees=lead.number_of_employees,
                website=lead.website,
                phone=lead.phone,
                billing_street=lead.street,
                billing_city=lead.city,
                billing_state=lead.state,
                billing_postal_code=lead.postal_code,
                billing_country=lead.country,
                shipping_street=lead.street,
                shipping_city=lead.city,
                shipping_state=lead.state,
                shipping_postal_code=lead.postal_code,
                shipping_country=lead.country,
                owner=lead.assigned_to,
                source_lead=lead,
                description=f"Converted from Lead: {lead}",
            )

        # ── 2. Create Contact ──
        if create_contact:
            contact = Contact.objects.create(
                account=account,
                first_name=contact_first_name or lead.first_name,
                last_name=contact_last_name or lead.last_name,
                email=lead.email,
                phone=lead.phone,
                mobile=lead.mobile,
                title=lead.title,
                mailing_street=lead.street,
                mailing_city=lead.city,
                mailing_state=lead.state,
                mailing_postal_code=lead.postal_code,
                mailing_country=lead.country,
                owner=lead.assigned_to,
                source_lead=lead,
            )

        # ── 3. Create Opportunity ──
        if create_opportunity and account:
            opportunity = Opportunity.objects.create(
                name=opportunity_name or f"Opportunity — {account.name}",
                account=account,
                contact=contact,
                amount=opportunity_amount or lead.expected_value,
                close_date=opportunity_close_date,
                stage=LeadStage.get_default_opportunity_stage(),  # First stage in pipeline
                probability=10,
                lead_source=lead.source,
                owner=lead.assigned_to,
                source_lead=lead,
                campaign=lead.campaign,
            )

        # ── 4. Migrate Related Data ──
        # Migrate calls
        Call.objects.filter(customer=lead).update(contact=contact)

        # Migrate tickets
        Ticket.objects.filter(customer=lead).update(contact=contact)

        # Migrate follow-ups
        Followup.objects.filter(customer=lead).update(contact=contact)

        # Migrate notes
        Note.objects.filter(customer=lead).update(contact=contact)

        # ── 5. Update Lead ──
        lead.is_converted = True
        lead.converted_date = timezone.now()
        lead.converted_by = converted_by
        lead.converted_account = account
        lead.converted_contact = contact
        lead.converted_opportunity = opportunity
        lead.save()

        # ── 6. Log Event ──
        LeadEvent.objects.create(
            lead=lead,
            event_type='converted',
            description=f"Lead converted to Account + Contact + Opportunity",
            created_by=converted_by,
            metadata={
                'account_id': str(account.id) if account else None,
                'contact_id': str(contact.id) if contact else None,
                'opportunity_id': str(opportunity.id) if opportunity else None,
            }
        )

        return {
            'account': account,
            'contact': contact,
            'opportunity': opportunity,
            'lead': lead,
        }
```

---

### 3. Updated Call Matching Logic

```python
# apps/calls/tasks.py — process_ami_event

def match_caller(phone_number):
    """
    Salesforce-style matching:
    1. Search for Contact first (not Customer)
    2. If Contact found → return Contact + Account
    3. If no Contact → search for Lead (not converted)
    4. If Lead found → return Lead (not converted)
    5. If nothing found → return None (new Lead may be created)
    """

    # First: Search for Contact
    contact = Contact.objects.filter(
        Q(phone=phone_number) |
        Q(mobile=phone_number) |
        Q(phone__endswith=phone_number[-9:]) |
        Q(mobile__endswith=phone_number[-9:])
    ).first()

    if contact:
        return {
            'type': 'contact',
            'contact': contact,
            'account': contact.account,
        }

    # Second: Search for Lead (not converted)
    lead = Lead.objects.filter(
        is_converted=False,
        Q(phone=phone_number) |
        Q(mobile=phone_number) |
        Q(phone__endswith=phone_number[-9:]) |
        Q(mobile__endswith=phone_number[-9:])
    ).first()

    if lead:
        return {
            'type': 'lead',
            'lead': lead,
        }

    return None
```

---

### 4. Updated Call Model

```python
# apps/calls/models.py

class Call(BaseModel):
    # Old:
    # customer = models.ForeignKey(Customer, ...)

    # New:
    contact = models.ForeignKey('customers.Contact', on_delete=models.SET_NULL, null=True, blank=True, related_name='calls')
    lead = models.ForeignKey('leads.Lead', on_delete=models.SET_NULL, null=True, blank=True, related_name='calls')
    account = models.ForeignKey('customers.Account', on_delete=models.SET_NULL, null=True, blank=True, related_name='calls')
    opportunity = models.ForeignKey('leads.Opportunity', on_delete=models.SET_NULL, null=True, blank=True, related_name='calls')
```

---

### 5. Updated Disposition Actions

```python
# apps/calls/services.py

def _create_lead(call, action):
    """
    The disposition action "create_lead" now creates a real Lead
    (not an Opportunity). This Lead is not yet qualified.
    """
    Lead.objects.create(
        first_name=call.caller_name or "Unknown",
        last_name="",
        phone=call.caller_phone,
        company=call.caller_company or "",
        source="inbound_call",
        stage=action.target_stage or LeadStage.get_default_lead_stage(),
        assigned_to=call.agent,
        originating_call=call,
    )

def _convert_lead(call, action):
    """
    New disposition action: convert_lead
    If the call is on an existing Lead, convert it to Account + Contact + Opportunity
    """
    lead = call.lead
    if lead and not lead.is_converted:
        convert_lead(lead, converted_by=call.agent)
```

---

### 6. Lead Scoring System

```python
# apps/leads/services.py

class LeadScorer:
    """
    Lead scoring system — determines when a Lead is qualified for conversion.
    """

    SCORE_RULES = {
        'has_email': 10,
        'has_company': 15,
        'has_title': 5,
        'inbound_call': 20,
        'outbound_call_answered': 15,
        'outbound_call_no_answer': -5,
        'disposition_interested': 30,
        'disposition_not_interested': -20,
        'followup_completed': 10,
        'website_visited': 5,
        'email_opened': 5,
    }

    THRESHOLDS = {
        'hot': 70,
        'warm': 40,
        'cold': 0,
    }

    @classmethod
    def calculate_score(cls, lead):
        score = 0

        if lead.email:
            score += cls.SCORE_RULES['has_email']
        if lead.company:
            score += cls.SCORE_RULES['has_company']
        if lead.title:
            score += cls.SCORE_RULES['has_title']

        # From calls
        for call in lead.calls.all():
            if call.direction == 'inbound':
                score += cls.SCORE_RULES['inbound_call']
            elif call.status == 'completed':
                score += cls.SCORE_RULES['outbound_call_answered']
            else:
                score += cls.SCORE_RULES['outbound_call_no_answer']

        # From dispositions
        for completion in lead.callcompletion_set.all():
            if 'interested' in completion.disposition.code.lower():
                score += cls.SCORE_RULES['disposition_interested']
            elif 'not interested' in completion.disposition.code.lower():
                score += cls.SCORE_RULES['disposition_not_interested']

        lead.lead_score = score
        lead.rating = cls._get_rating(score)
        lead.save()
        return score

    @classmethod
    def _get_rating(cls, score):
        if score >= cls.THRESHOLDS['hot']:
            return 'hot'
        elif score >= cls.THRESHOLDS['warm']:
            return 'warm'
        return 'cold'
```

---

### 7. New API Endpoints

```python
# apps/leads/views.py

class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.filter(is_converted=False)

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        """
        POST /api/leads/{id}/convert/

        {
            "create_account": true,
            "create_contact": true,
            "create_opportunity": true,
            "account_name": "Client Company",
            "opportunity_name": "Q2 2026 Deal",
            "opportunity_amount": 50000,
            "opportunity_close_date": "2026-06-30"
        }
        """
        lead = self.get_object()
        result = convert_lead(lead, converted_by=request.user, **request.data)
        return Response({
            'lead': LeadSerializer(lead).data,
            'account': AccountSerializer(result['account']).data if result['account'] else None,
            'contact': ContactSerializer(result['contact']).data if result['contact'] else None,
            'opportunity': OpportunitySerializer(result['opportunity']).data if result['opportunity'] else None,
        })

    @action(detail=True, methods=['post'])
    def score(self, request, pk=None):
        """
        POST /api/leads/{id}/score/
        Calculates and updates Lead Score
        """
        lead = self.get_object()
        score = LeadScorer.calculate_score(lead)
        return Response({'score': score, 'rating': lead.rating})


class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.all()

    @action(detail=True, methods=['post'])
    def close_won(self, request, pk=None):
        opp = self.get_object()
        opp.is_won = True
        opp.is_closed = True
        opp.closed_date = timezone.now().date()
        opp.save()
        return Response(OpportunitySerializer(opp).data)

    @action(detail=True, methods=['post'])
    def close_lost(self, request, pk=None):
        opp = self.get_object()
        opp.is_won = False
        opp.is_closed = True
        opp.closed_date = timezone.now().date()
        opp.lost_reason = request.data.get('reason', '')
        opp.save()
        return Response(OpportunitySerializer(opp).data)


class AccountViewSet(viewsets.ModelViewSet):
    queryset = Account.objects.all()


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.all()
```

---

### 8. Migration Strategy

```python
# apps/customers/migrations/XXXX_migrate_customers.py

def migrate_customers_to_accounts(apps, schema_editor):
    """
    Migration to convert existing data:
    Each Customer → Account + Contact
    """
    Customer = apps.get_model('customers', 'Customer')
    Account = apps.get_model('customers', 'Account')
    Contact = apps.get_model('customers', 'Contact')

    for customer in Customer.objects.all():
        account = Account.objects.create(
            name=customer.company or customer.name,
            phone=customer.phone_number,
            owner=customer.created_by,
        )

        Contact.objects.create(
            account=account,
            first_name=customer.name.split()[0] if customer.name else "Unknown",
            last_name=' '.join(customer.name.split()[1:]) if len(customer.name.split()) > 1 else "",
            email=customer.email,
            phone=customer.phone_number,
            owner=customer.created_by,
        )
```

---

## Part Two: Frontend (Next.js)

### 1. Restructured Navigation

```
Before:
├── Customers
│   ├── List
│   └── Detail
├── Leads
│   ├── List
│   ├── Pipeline
│   └── Detail

After:
├── Leads
│   ├── List (unqualified only)
│   ├── Detail
│   └── Scoring
├── Accounts
│   ├── List
│   └── Detail
├── Contacts
│   ├── List
│   └── Detail
├── Opportunities
│   ├── List
│   ├── Pipeline (Kanban) — the real pipeline lives here
│   └── Detail
```

---

### 2. New TypeScript Types

```typescript
// src/types/index.ts

export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string;
  mobile: string | null;
  company: string | null;
  title: string | null;
  status: LeadStatus;
  stage: LeadStage;
  priority: LeadPriority | null;
  source: string;
  industry: string | null;
  annual_revenue: number | null;
  number_of_employees: number | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  assigned_to: User | null;
  campaign: Campaign | null;
  is_converted: boolean;
  converted_date: string | null;
  converted_account: Account | null;
  converted_contact: Contact | null;
  converted_opportunity: Opportunity | null;
  lead_score: number;
  rating: 'hot' | 'warm' | 'cold';
  expected_value: number | null;
  won_amount: number | null;
  lost_reason: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  account_type: 'prospect' | 'customer' | 'partner' | 'reseller';
  industry: string | null;
  annual_revenue: number | null;
  number_of_employees: number | null;
  website: string | null;
  phone: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  owner: User | null;
  parent_account: Account | null;
  source_lead: Lead | null;
  contacts: Contact[];
  opportunities: Opportunity[];
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account: Account;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  title: string | null;
  department: string | null;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_postal_code: string | null;
  mailing_country: string | null;
  owner: User | null;
  source_lead: Lead | null;
  opportunities: Opportunity[];
  created_at: string;
  updated_at: string;
}

export interface Opportunity {
  id: string;
  name: string;
  account: Account;
  contact: Contact | null;
  amount: number | null;
  close_date: string | null;
  stage: LeadStage;
  probability: number;
  type: 'new_business' | 'existing_business' | 'replacement';
  lead_source: string;
  next_step: string;
  owner: User | null;
  source_lead: Lead | null;
  campaign: Campaign | null;
  is_closed: boolean;
  is_won: boolean;
  closed_date: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}
```

---

### 3. Incoming Call Popup — Updated Screen Pop

```typescript
// src/components/calls/IncomingCallPopup.tsx

const handleAnswer = useCallback(() => {
  const call = incomingCallRef.current;
  const matchType = call?.match_type; // 'contact' | 'lead' | null

  // Mark answered
  if (callId) {
    callsApi.markCallAnswered(callId);
  }

  actions?.answer();

  // Screen pop logic — Salesforce style
  if (matchType === 'contact') {
    // Found a Contact → show Contact + Account
    router.push(`/contacts/${call.contact_id}`);
  } else if (matchType === 'lead') {
    // Found a Lead (not converted) → show Lead
    router.push(`/leads/${call.lead_id}`);
  } else {
    // Found nothing → show new Lead creation form
    router.push(`/leads/new?phone=${encodeURIComponent(caller)}&uniqueid=${encodeURIComponent(uniqueid)}`);
  }
}, [actions, router]);
```

---

### 4. Lead Conversion Modal

```typescript
// src/components/leads/LeadConversionModal.tsx

export function LeadConversionModal({ lead, onClose }: Props) {
  const [createAccount, setCreateAccount] = useState(true);
  const [createContact, setCreateContact] = useState(true);
  const [createOpportunity, setCreateOpportunity] = useState(true);

  const [accountName, setAccountName] = useState(lead.company || '');
  const [contactFirstName, setContactFirstName] = useState(lead.first_name);
  const [contactLastName, setContactLastName] = useState(lead.last_name);
  const [opportunityName, setOpportunityName] = useState('');
  const [opportunityAmount, setOpportunityAmount] = useState(lead.expected_value || '');
  const [opportunityCloseDate, setOpportunityCloseDate] = useState('');

  const handleConvert = async () => {
    const result = await leadsApi.convert(lead.id, {
      create_account: createAccount,
      create_contact: createContact,
      create_opportunity: createOpportunity,
      account_name: accountName,
      contact_first_name: contactFirstName,
      contact_last_name: contactLastName,
      opportunity_name: opportunityName,
      opportunity_amount: opportunityAmount,
      opportunity_close_date: opportunityCloseDate,
    });

    // Redirect to the created Opportunity
    if (result.opportunity) {
      router.push(`/opportunities/${result.opportunity.id}`);
    } else if (result.contact) {
      router.push(`/contacts/${result.contact.id}`);
    }
  };

  return (
    <Modal>
      <h2>Convert Lead</h2>

      {/* Account */}
      <Checkbox checked={createAccount} onChange={setCreateAccount}>
        Create Account (Company)
      </Checkbox>
      {createAccount && (
        <Input label="Company Name" value={accountName} onChange={setAccountName} />
      )}

      {/* Contact */}
      <Checkbox checked={createContact} onChange={setCreateContact}>
        Create Contact (Person)
      </Checkbox>
      {createContact && (
        <>
          <Input label="First Name" value={contactFirstName} onChange={setContactFirstName} />
          <Input label="Last Name" value={contactLastName} onChange={setContactLastName} />
        </>
      )}

      {/* Opportunity */}
      <Checkbox checked={createOpportunity} onChange={setCreateOpportunity}>
        Create Opportunity (Sales Deal)
      </Checkbox>
      {createOpportunity && (
        <>
          <Input label="Opportunity Name" value={opportunityName} onChange={setOpportunityName} />
          <Input label="Expected Amount" value={opportunityAmount} onChange={setOpportunityAmount} />
          <Input label="Expected Close Date" type="date" value={opportunityCloseDate} onChange={setOpportunityCloseDate} />
        </>
      )}

      <Button onClick={handleConvert}>Convert</Button>
    </Modal>
  );
}
```

---

### 5. Opportunity Pipeline (Kanban)

```typescript
// src/app/(dashboard)/opportunities/pipeline/page.tsx

export default function OpportunityPipeline() {
  const { data: opportunities } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => opportunitiesApi.list({ is_closed: false }),
  });

  const stages = useQuery({
    queryKey: ['opportunity-stages'],
    queryFn: () => stagesApi.list({ for: 'opportunity' }),
  });

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;

    await opportunitiesApi.moveStage(draggableId, {
      stage_id: destination.droppableId,
    });
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {stages.data?.map(stage => (
          <Droppable key={stage.id} droppableId={stage.id}>
            {(provided) => (
              <div className="min-w-[300px] bg-gray-50 rounded-xl p-3">
                <h3 className="font-semibold mb-3" style={{ color: stage.color }}>
                  {stage.name}
                </h3>
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  {opportunities
                    ?.filter(opp => opp.stage.id === stage.id)
                    .map(opp => (
                      <Draggable key={opp.id} draggableId={opp.id} index={0}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps}>
                            <OpportunityCard opportunity={opp} />
                          </div>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
```

---

### 6. Lead Detail Page — With Convert Button

```typescript
// src/app/(dashboard)/leads/[id]/page.tsx

export default function LeadDetail({ params }: Props) {
  const { data: lead } = useQuery({
    queryKey: ['lead', params.id],
    queryFn: () => leadsApi.get(params.id),
  });

  const [showConvertModal, setShowConvertModal] = useState(false);

  if (!lead) return <Loading />;

  return (
    <div className="p-6">
      {/* Lead Info */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1>{lead.first_name} {lead.last_name}</h1>

          {/* Convert button — only shows if Lead is not converted */}
          {!lead.is_converted && (
            <Button
              variant="primary"
              onClick={() => setShowConvertModal(true)}
            >
              Convert to Account + Contact + Opportunity
            </Button>
          )}

          {lead.is_converted && (
            <Badge variant="success">Converted</Badge>
          )}
        </div>

        {/* Lead Score */}
        <LeadScoreBadge score={lead.lead_score} rating={lead.rating} />

        {/* Contact Info */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <InfoField label="Email" value={lead.email} />
          <InfoField label="Phone" value={lead.phone} />
          <InfoField label="Company" value={lead.company} />
          <InfoField label="Job Title" value={lead.title} />
        </div>
      </div>

      {/* Activity Timeline */}
      <LeadTimeline leadId={lead.id} />

      {/* Converted entities */}
      {lead.is_converted && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {lead.converted_account && (
            <EntityCard
              title="Account"
              link={`/accounts/${lead.converted_account.id}`}
            />
          )}
          {lead.converted_contact && (
            <EntityCard
              title="Contact"
              link={`/contacts/${lead.converted_contact.id}`}
            />
          )}
          {lead.converted_opportunity && (
            <EntityCard
              title="Opportunity"
              link={`/opportunities/${lead.converted_opportunity.id}`}
            />
          )}
        </div>
      )}

      {/* Conversion Modal */}
      {showConvertModal && (
        <LeadConversionModal
          lead={lead}
          onClose={() => setShowConvertModal(false)}
        />
      )}
    </div>
  );
}
```

---

### 7. Updated API Clients

```typescript
// src/lib/api/leads.ts

export const leadsApi = {
  // ... existing methods

  convert: (id: string, data: ConvertPayload) =>
    api.post(`/leads/${id}/convert/`, data),

  score: (id: string) =>
    api.post(`/leads/${id}/score/`),
};

// src/lib/api/opportunities.ts — New

export const opportunitiesApi = {
  list: (params?: object) =>
    api.get('/opportunities/', { params }),

  get: (id: string) =>
    api.get(`/opportunities/${id}/`),

  create: (data: OpportunityPayload) =>
    api.post('/opportunities/', data),

  update: (id: string, data: Partial<OpportunityPayload>) =>
    api.patch(`/opportunities/${id}/`, data),

  moveStage: (id: string, data: { stage_id: string }) =>
    api.patch(`/opportunities/${id}/move-stage/`, data),

  closeWon: (id: string, data: { amount: number }) =>
    api.post(`/opportunities/${id}/close-won/`, data),

  closeLost: (id: string, data: { reason: string }) =>
    api.post(`/opportunities/${id}/close-lost/`, data),
};

// src/lib/api/accounts.ts — New

export const accountsApi = {
  list: (params?: object) =>
    api.get('/accounts/', { params }),

  get: (id: string) =>
    api.get(`/accounts/${id}/`),

  create: (data: AccountPayload) =>
    api.post('/accounts/', data),

  update: (id: string, data: Partial<AccountPayload>) =>
    api.patch(`/accounts/${id}/`, data),
};

// src/lib/api/contacts.ts — New

export const contactsApi = {
  list: (params?: object) =>
    api.get('/contacts/', { params }),

  get: (id: string) =>
    api.get(`/contacts/${id}/`),

  create: (data: ContactPayload) =>
    api.post('/contacts/', data),

  update: (id: string, data: Partial<ContactPayload>) =>
    api.patch(`/contacts/${id}/`, data),
};
```

---

### 8. Updated Sidebar Navigation

```typescript
// src/components/layout/Sidebar.tsx

const navigation = [
  {
    section: 'Sales',
    items: [
      { label: 'Leads', icon: Users, href: '/leads' },
      { label: 'Accounts', icon: Building, href: '/accounts' },
      { label: 'Contacts', icon: UserCheck, href: '/contacts' },
      { label: 'Opportunities', icon: Target, href: '/opportunities' },
      { label: 'Pipeline', icon: Columns, href: '/opportunities/pipeline' },
    ],
  },
  {
    section: 'Calls',
    items: [
      { label: 'Calls', icon: Phone, href: '/calls' },
    ],
  },
  {
    section: 'Support',
    items: [
      { label: 'Tickets', icon: LifeBuoy, href: '/tickets' },
    ],
  },
  // ...
];
```

---

## Summary of Changes

| Component | Before | After |
|---|---|---|
| **Primary Entity** | Customer | Lead |
| **Entry Point** | Call → Customer match | Call → Lead match or new Lead |
| **Qualification** | Lead = Opportunity | Lead = Unqualified person |
| **Conversion** | Not available | Lead → Account + Contact + Opportunity |
| **Pipeline** | On Lead | On Opportunity |
| **Won** | Lead.won = True | Opportunity.is_won = True → Account becomes customer |
| **Screen Pop** | Customer detail | Contact detail or Lead detail |
| **Navigation** | Customers, Leads | Leads, Accounts, Contacts, Opportunities |
| **Scoring** | Not available | Lead Scoring system |

---

## Recommended Implementation Phases

1. **Phase 1**: Create new models (Account, Contact, Opportunity) + migrations
2. **Phase 2**: Write Lead Conversion Service + API endpoints
3. **Phase 3**: Update Call Matching Logic
4. **Phase 4**: Data Migration from old Customer records
5. **Phase 5**: Frontend — New types + API clients
6. **Phase 6**: Frontend — New pages (Accounts, Contacts, Opportunities)
7. **Phase 7**: Frontend — Lead Conversion Modal
8. **Phase 8**: Frontend — Update Incoming Call Popup
9. **Phase 9**: Lead Scoring System
10. **Phase 10**: Testing + QA
