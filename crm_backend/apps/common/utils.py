import re
from django.utils import timezone


def normalize_phone(phone: str) -> str:
    """
    Normalize Egyptian phone numbers to canonical 11-digit format starting with 0.
    Handles: +201001234567, 00201001234567, 01001234567, 201001234567
    Returns: 01001234567
    """
    digits = re.sub(r'\D', '', phone)

    if not digits:
        return ''

    # Strip country code variants
    if digits.startswith('0020'):
        digits = digits[4:]
    elif digits.startswith('+20'):
        digits = digits[3:]
    elif digits.startswith('20') and len(digits) >= 11:
        digits = digits[2:]

    # Ensure leading zero
    if not digits.startswith('0'):
        digits = '0' + digits

    return digits


def phone_search_variants(phone: str) -> list[str]:
    """
    Generate all possible variants for phone matching against Asterisk caller IDs.
    Asterisk sends numbers in unpredictable formats.
    """
    normalized = normalize_phone(phone)
    if not normalized:
        return []

    digits = normalized.lstrip('0')
    variants = {
        normalized,           # 01001234567
        digits,               # 1001234567
        '+20' + digits,       # +201001234567
        '20' + digits,        # 201001234567
        '0020' + digits,      # 00201001234567
    }
    # Last 9 digits (common Asterisk truncation)
    if len(digits) >= 9:
        variants.add(digits[-9:])
    if len(normalized) >= 9:
        variants.add(normalized[-9:])

    return [v for v in variants if v]


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
