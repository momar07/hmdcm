from .models import Note


def get_notes_for_customer(customer_id):
    return Note.objects.filter(customer_id=customer_id).select_related('author')

def get_notes_for_lead(lead_id):
    return Note.objects.filter(lead_id=lead_id).select_related('author')

def get_notes_for_call(call_id):
    return Note.objects.filter(call_id=call_id).select_related('author')
