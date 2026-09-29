"""Normalization rules — phone, amount (Hinglish), dates, names, addresses."""
import re
from datetime import datetime
from typing import Any

HINDI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def normalize_phone(raw: str) -> str:
    text = raw.translate(HINDI_DIGITS)
    digits = re.sub(r"\D", "", text)
    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"+91{digits[1:]}"
    return f"+{digits}" if digits else raw.strip()


def normalize_amount(raw: str) -> dict[str, Any]:
    lower = raw.lower().strip().translate(HINDI_DIGITS)
    lower = lower.replace("rs.", "").replace("rs", "").replace("inr", "").strip()

    crore = re.search(r"(\d+(?:\.\d+)?)\s*(?:crore|cr)\b", lower)
    if crore:
        val = float(crore.group(1)) * 10_000_000
        return {"normalized": f"₹{val:,.0f}", "numeric": val, "currency": "INR"}

    lakh = re.search(r"(\d+(?:\.\d+)?)\s*(?:lakh|lac)\b", lower)
    if lakh:
        val = float(lakh.group(1)) * 100_000
        return {"normalized": f"₹{val:,.0f}", "numeric": val, "currency": "INR"}

    thousand = re.search(r"(\d+(?:\.\d+)?)\s*(?:hazaar|hazar|thousand|k)\b", lower)
    if thousand:
        val = float(thousand.group(1)) * 1_000
        return {"normalized": f"₹{val:,.0f}", "numeric": val, "currency": "INR"}

    num = re.sub(r"[₹,\s]", "", lower)
    m = re.match(r"(\d+(?:\.\d+)?)", num)
    if m:
        val = float(m.group(1))
        return {"normalized": f"₹{val:,.2f}" if "." in m.group(1) else f"₹{val:,.0f}", "numeric": val, "currency": "INR"}

    return {"normalized": raw.strip(), "numeric": None, "currency": "INR"}


def normalize_name(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.strip()).title()


def normalize_address(raw: str) -> str:
    text = raw.lower().translate(HINDI_DIGITS)
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_date(raw: str) -> dict[str, Any]:
    text = raw.strip().translate(HINDI_DIGITS)
    formats = [
        "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
        "%d %B %Y", "%d %b %Y", "%B %d, %Y",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(text, fmt)
            return {"normalized": dt.strftime("%Y-%m-%d"), "iso": dt.isoformat()}
        except ValueError:
            continue
    return {"normalized": text, "iso": None}


def normalize_entity(entity_type: str, value: str) -> dict[str, Any]:
    t = entity_type.upper()
    if t == "PHONE":
        return {"type": t, "value": value, "normalized": normalize_phone(value)}
    if t == "AMOUNT":
        amt = normalize_amount(value)
        return {"type": t, "value": value, "normalized": amt["normalized"], "numeric": amt["numeric"]}
    if t == "PERSON":
        return {"type": t, "value": value, "normalized": normalize_name(value)}
    if t in ("ADDRESS", "LOCATION"):
        return {"type": t, "value": value, "normalized": normalize_address(value)}
    if t == "DATE":
        d = normalize_date(value)
        return {"type": t, "value": value, "normalized": d["normalized"], "iso": d.get("iso")}
    if t == "VEHICLE":
        return {"type": t, "value": value, "normalized": re.sub(r"\s+", "", value).upper()}
    if t == "EMAIL":
        return {"type": t, "value": value, "normalized": value.strip().lower()}
    if t == "UPI":
        return {"type": t, "value": value, "normalized": value.strip().lower()}
    if t == "BANK_ACCOUNT":
        return {"type": t, "value": value, "normalized": re.sub(r"\D", "", value)}
    if t == "IFSC":
        return {"type": t, "value": value, "normalized": value.strip().upper()}
    if t == "DOMAIN":
        return {"type": t, "value": value, "normalized": value.strip().lower().removeprefix("www.")}
    return {"type": t, "value": value, "normalized": value.strip()}


def detect_language(text: str) -> str:
    devanagari = len(re.findall(r"[\u0900-\u097F]", text))
    latin = len(re.findall(r"[A-Za-z]", text))
    if devanagari > latin * 0.3:
        return "hi" if latin < devanagari else "hinglish"
    return "en"
