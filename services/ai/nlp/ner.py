"""Multilingual NER — 17 entity types (regex + pattern-based, Hindi/English/Hinglish)."""
import re
from dataclasses import dataclass

INDIAN_CITIES = [
    "Bengaluru", "Bangalore", "Mumbai", "Delhi", "New Delhi", "Chennai", "Kolkata",
    "Hyderabad", "Pune", "Jaipur", "Lucknow", "Ahmedabad", "Surat", "Nagpur",
    "Indore", "Bhopal", "Patna", "Ranchi", "Guwahati", "Chandigarh", "Koramangala",
    "MG Road", "Noida", "Gurugram", "Gurgaon", "Thane", "Navi Mumbai",
]

ORG_SUFFIXES = r"(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Bank|Corporation|Police|Cell)"


@dataclass
class ExtractedEntity:
    type: str
    value: str
    confidence: float


def extract_entities_from_text(text: str) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    seen: set[str] = set()

    def add(entity_type: str, value: str, confidence: float):
        key = f"{entity_type}:{value.lower().strip()}"
        if key not in seen and value.strip():
            seen.add(key)
            entities.append(ExtractedEntity(type=entity_type, value=value.strip(), confidence=confidence))

    # PHONE
    for m in re.finditer(r"(?:\+91[\s-]?)?[6-9]\d{9}|0?[6-9]\d{9}", text):
        add("PHONE", m.group(), 0.92)

    # EMAIL
    for m in re.finditer(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text):
        add("EMAIL", m.group(), 0.95)

    # UPI (not email domains)
    for m in re.finditer(r"\b([a-zA-Z0-9._-]+@(?:paytm|ybl|okaxis|okicici|axl|ibl|upi))\b", text, re.I):
        add("UPI", m.group(1).lower(), 0.9)
    for m in re.finditer(r"\bUPI\s*(?:ID|id)?[\s:]*([a-zA-Z0-9._-]+@[a-zA-Z]+)\b", text):
        val = m.group(1)
        if ".com" not in val and ".in" not in val:
            add("UPI", val.lower(), 0.88)

    # IFSC
    for m in re.finditer(r"\b[A-Z]{4}0[A-Z0-9]{6}\b", text):
        add("IFSC", m.group(), 0.96)

    # BANK_ACCOUNT
    for m in re.finditer(r"(?:account|a/c|acct|account\s*no)[\s.:]*(\d{9,18})", text, re.I):
        add("BANK_ACCOUNT", m.group(1), 0.88)

    # VEHICLE (Indian plates)
    for m in re.finditer(r"\b[A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{1,4}\b", text, re.I):
        add("VEHICLE", re.sub(r"\s", "", m.group()).upper(), 0.9)

    # AMOUNT
    for m in re.finditer(
        r"₹\s?[\d,]+(?:\.\d{2})?|\d+(?:\.\d+)?\s*(?:lakh|lac|crore|cr|hazaar|hazar|thousand)\b",
        text, re.I,
    ):
        add("AMOUNT", m.group(), 0.85)
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*(?:hazaar|hazar)\b", text, re.I):
        add("AMOUNT", f"₹{int(float(m.group(1)) * 1000):,}", 0.82)

    # IP_ADDRESS
    for m in re.finditer(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", text):
        add("IP_ADDRESS", m.group(), 0.9)

    # DOMAIN
    for m in re.finditer(r"\b(?:https?://)?(?:www\.)?([a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|in|org|net|gov|co\.in))\b", text, re.I):
        add("DOMAIN", m.group(1).lower(), 0.85)

    # CRYPTO_WALLET
    for m in re.finditer(r"\b(0x[a-fA-F0-9]{40})\b", text):
        add("CRYPTO_WALLET", m.group(1), 0.93)
    for m in re.finditer(r"\b([13][a-km-zA-HJ-NP-Z1-9]{25,34})\b", text):
        add("CRYPTO_WALLET", m.group(1), 0.9)

    # DEVICE (IMEI)
    for m in re.finditer(r"\bIMEI[\s:]*(\d{15})\b", text, re.I):
        add("DEVICE", m.group(1), 0.94)
    for m in re.finditer(r"\b(\d{15})\b", text):
        if m.group(1).startswith(("35", "86", "01")):
            add("DEVICE", m.group(1), 0.75)

    # DATE
    for m in re.finditer(
        r"\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
        text, re.I,
    ):
        add("DATE", m.group(), 0.88)

    # CASE_ID
    for m in re.finditer(r"\b(?:CASE|FIR|CR)[\s/-]*(?:NO\.?|NUMBER)?[\s:]*([A-Z0-9/-]{5,20})\b", text, re.I):
        add("CASE_ID", m.group(0).strip(), 0.8)

    # PERSON (English + context)
    for m in re.finditer(
        r"(?:victim|accused|suspect|complainant|witness|mr\.?|mrs\.?|ms\.?|shri|smt\.?|श्री|श्रीमती)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
        text, re.I,
    ):
        add("PERSON", m.group(1), 0.78)
    for m in re.finditer(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:ne|ko|se|ka|ki|ke|aur)\b", text):
        add("PERSON", m.group(1), 0.72)
    for m in re.finditer(r"(?:accused\s+persons?\s+(?:are|is)\s+)([A-Z][a-z]+(?:\s+(?:and|aur)\s+[A-Z][a-z]+)+)", text, re.I):
        names = re.split(r"\s+(?:and|aur)\s+", m.group(1), flags=re.I)
        for name in names:
            add("PERSON", name.strip(), 0.8)

    # PERSON (Devanagari names — 2-4 words)
    for m in re.finditer(r"[\u0900-\u097F]{2,15}(?:\s+[\u0900-\u097F]{2,15}){1,3}", text):
        add("PERSON", m.group(), 0.7)

    # ORGANIZATION
    for m in re.finditer(rf"\b([A-Z][A-Za-z0-9\s&]+{ORG_SUFFIXES})\b", text):
        add("ORGANIZATION", m.group(1).strip(), 0.82)
    for m in re.finditer(r"(?:Cyber\s+Crime\s+Cell|Police\s+Station)[^,\n]*", text, re.I):
        add("ORGANIZATION", m.group().strip(), 0.85)

    # SOCIAL_HANDLE
    for m in re.finditer(r"(?:@|twitter:|instagram:)\s*([a-zA-Z0-9_]{3,30})\b", text, re.I):
        add("SOCIAL_HANDLE", f"@{m.group(1)}", 0.8)

    # ADDRESS
    for m in re.finditer(
        r"(?:address|residence|office\s+at|located\s+at)[\s:]*([A-Za-z0-9\s,.-]{10,80})",
        text, re.I,
    ):
        add("ADDRESS", m.group(1).strip().rstrip(","), 0.75)

    # LOCATION
    for city in INDIAN_CITIES:
        if re.search(rf"\b{re.escape(city)}\b", text, re.I):
            add("LOCATION", city, 0.8)
    for m in re.finditer(r"(?:at|in|near|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})", text):
        add("LOCATION", m.group(1), 0.72)

    return entities
