import re
from django.utils import timezone


def normalize_phone(phone: str) -> str:
    """Strip all non-digit characters and normalize Egyptian numbers."""
    digits = re.sub(r'\D', '', phone)
    # Normalize 0201... -> 201...
    if digits.startswith('0') and len(digits) == 11:
        digits = '2' + digits  # Egypt country code
    return digits


def format_duration(seconds: int) -> str:
    """Convert seconds to HH:MM:SS string."""
    if not seconds:
        return '00:00:00'
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    return f'{h:02d}:{m:02d}:{s:02d}'


def get_client_ip(request) -> str:
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')
