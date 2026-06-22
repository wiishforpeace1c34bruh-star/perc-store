"""
modules/osint/phone.py — Phone number intelligence
Parses, validates, and enriches phone numbers using the phonenumbers library.
Extracts carrier, line type, timezone, country, and geocoder info.
"""

import time
from typing import Any

try:
    import phonenumbers
    from phonenumbers import carrier as pn_carrier
    from phonenumbers import geocoder as pn_geocoder
    from phonenumbers import timezone as pn_timezone
    from phonenumbers import PhoneNumberType
    HAS_PHONENUMBERS = True
except ImportError:
    HAS_PHONENUMBERS = False

from core.display import (
    console, success, error, warning, info, scan_header, scan_complete,
    key_value_block, section_header,
)


# Mapping of PhoneNumberType enum to human-readable labels
_LINE_TYPE_LABELS: dict[int, str] = {
    0: "Fixed Line",
    1: "Mobile",
    2: "Fixed Line or Mobile",
    3: "Toll-Free",
    4: "Premium Rate",
    5: "Shared Cost",
    6: "VoIP",
    7: "Personal Number",
    8: "Pager",
    9: "UAN (Universal Access)",
    10: "Voicemail",
    27: "Emergency",
    28: "Short Code",
    29: "Standard Rate",
    -1: "Unknown",
}


def scan_phone(phone: str) -> dict:
    """Analyze a phone number for carrier, location, and type information.

    Args:
        phone: Phone number string (ideally with country code, e.g. +1234567890).
              If no '+' is present, the number is assumed to be US (+1).

    Returns:
        Dict with parsed phone intelligence.
    """
    scan_header("Phone Number Analysis", phone)
    start = time.time()

    if not HAS_PHONENUMBERS:
        error("phonenumbers library is not installed — run: pip install phonenumbers")
        return {"error": "phonenumbers not installed", "target": phone}

    results: dict[str, Any] = {
        "scan_type": "phone_analysis",
        "target": phone,
    }

    # ── Parsing ────────────────────────────────────────────────
    try:
        # Default region US if no country code provided
        parsed = phonenumbers.parse(phone, "US")
    except phonenumbers.NumberParseException as exc:
        error(f"Could not parse phone number: {exc}")
        results["error"] = str(exc)
        return results

    # ── Validation ─────────────────────────────────────────────
    is_valid = phonenumbers.is_valid_number(parsed)
    is_possible = phonenumbers.is_possible_number(parsed)

    # ── Formatting ─────────────────────────────────────────────
    fmt_international = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
    fmt_national = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
    fmt_e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)

    # ── Carrier ────────────────────────────────────────────────
    try:
        carrier_name = pn_carrier.name_for_number(parsed, "en") or "Unknown"
    except Exception:
        carrier_name = "Unknown"

    # ── Line type ──────────────────────────────────────────────
    try:
        number_type_int = phonenumbers.number_type(parsed)
        line_type = _LINE_TYPE_LABELS.get(number_type_int, "Unknown")
    except Exception:
        line_type = "Unknown"

    # ── Geocoder (location) ────────────────────────────────────
    try:
        location = pn_geocoder.description_for_number(parsed, "en") or "Unknown"
    except Exception:
        location = "Unknown"

    # ── Country ────────────────────────────────────────────────
    country_code = parsed.country_code
    try:
        region = phonenumbers.region_code_for_number(parsed)
    except Exception:
        region = "Unknown"

    # ── Timezone ───────────────────────────────────────────────
    try:
        tz_list = list(pn_timezone.time_zones_for_number(parsed))
    except Exception:
        tz_list = []

    # ── Assemble results ───────────────────────────────────────
    results.update({
        "valid": is_valid,
        "possible": is_possible,
        "country_code": country_code,
        "region_code": region,
        "carrier": carrier_name,
        "line_type": line_type,
        "location": location,
        "timezones": tz_list,
        "format": {
            "international": fmt_international,
            "national": fmt_national,
            "e164": fmt_e164,
        },
    })

    # ── Display: Validation ────────────────────────────────────
    validation_data = {
        "Valid Number": is_valid,
        "Possible Number": is_possible,
    }
    key_value_block("Validation", validation_data)

    if not is_valid:
        warning("This number did NOT pass validation — results may be unreliable")

    # ── Display: Formatting ────────────────────────────────────
    format_data = {
        "International": fmt_international,
        "National": fmt_national,
        "E.164": fmt_e164,
    }
    key_value_block("Number Formats", format_data)

    # ── Display: Intelligence ──────────────────────────────────
    intel_data: dict[str, Any] = {
        "Country Code": f"+{country_code}",
        "Region": region,
        "Location": location,
        "Carrier": carrier_name,
        "Line Type": line_type,
    }
    if tz_list:
        intel_data["Timezone(s)"] = ", ".join(tz_list)
    else:
        intel_data["Timezone(s)"] = None

    key_value_block("Phone Intelligence", intel_data)

    # ── Threat indicators ──────────────────────────────────────
    if line_type == "VoIP":
        warning("VoIP number detected — may be a disposable / burner number")
    if line_type == "Toll-Free":
        info("Toll-free number — typically associated with businesses")
    if line_type == "Premium Rate":
        warning("Premium rate number — calls may incur charges")

    elapsed = time.time() - start
    scan_complete(elapsed)
    results["elapsed_seconds"] = round(elapsed, 2)

    return results
