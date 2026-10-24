"""Layer 1: regex + checksum rules for Indian identifiers, money and contact data.

Each rule is a regex plus, optionally:
  - a validator (checksum) — a pass gives score 1.0 and validated=True
  - context words that must appear just before the match (for patterns that
    are too generic on their own, like a 9-18 digit bank account number)

Run on normalized text (see normalize.py); offsets equal the original text's.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field

from schemas import Entity, EntityType

from .validators import (
    aadhaar_ok,
    gstin_ok,
    ifsc_ok,
    luhn_ok,
    pan_ok,
    vid_ok,
)

# Boundaries: not glued to other letters/digits.
_NA = r"(?<![A-Za-z0-9])"   # no alnum before
_NZ = r"(?![A-Za-z0-9])"    # no alnum after
_ND = r"(?<!\d)"
_NDZ = r"(?!\d)"


@dataclass
class Rule:
    type: EntityType
    pattern: re.Pattern
    score: float = 0.9
    validator: Callable[[str], bool] | None = None
    # When the validator fails: keep with this score if context is present, else drop.
    fallback_score: float | None = None
    context: list[str] = field(default_factory=list)
    context_required: bool = False
    window: int = 40
    # Words that mean "this is something else" (an order or tracking number).
    exclude: list[str] = field(default_factory=list)


def _r(p: str, flags: int = 0) -> re.Pattern:
    return re.compile(p, flags)


AADHAAR_CTX = ["aadhaar", "aadhar", "adhaar", "uid", "आधार", "आधार क्रमांक", "ஆதார்", "ఆధార్", "আধার"]
PAN_CTX = ["pan", "permanent account", "पैन"]
ACCOUNT_CTX = [
    "a/c", "a/c no", "acct", "account", "acc no", "acc. no", "savings", "current a",
    "खाता", "खाते", "बैंक", "खाता क्रमांक", "கணக்கு", "ఖాతా",
]
PASSPORT_CTX = ["passport", "पासपोर्ट", "पारपत्र"]
DOB_CTX = ["dob", "d.o.b", "date of birth", "birth", "born", "जन्म", "जन्मतिथि", "जन्म तिथि", "பிறந்த", "పుట్టిన"]
PIN_CTX = ["pin", "pincode", "pin code", "postal", "zip", "पिन", "पिनकोड"]
VID_CTX = ["vid", "virtual id"]

NOT_ID_CTX = ["order", "tracking", "invoice", "txn", "transaction", "ref", "awb", "ticket", "booking", "pnr"]

_MONTHS = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*"

RULES: list[Rule] = [
    Rule("EMAIL", _r(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"), score=0.99),
    # UPI handle: like an email but the part after @ has no dot (okaxis, ybl, paytm...).
    # A trailing full stop is allowed (end of sentence), a ".com"-style suffix is not.
    Rule("UPI", _r(r"(?<![\w.@-])[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}(?![\w@-]|\.[A-Za-z])"), score=0.92),
    Rule("AADHAAR", _r(_ND + r"[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}" + _NDZ),
         validator=aadhaar_ok, fallback_score=0.75, context=AADHAAR_CTX, score=1.0, exclude=NOT_ID_CTX),
    Rule("VID", _r(_ND + r"\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}" + _NDZ),
         validator=vid_ok, fallback_score=0.7, context=VID_CTX, score=0.95, exclude=NOT_ID_CTX),
    # A long number next to "A/c" is an account even if it happens to pass Luhn.
    Rule("CARD", _r(_ND + r"(?:\d[ -]?){12,18}\d" + _NDZ), validator=luhn_ok, score=0.97,
         exclude=ACCOUNT_CTX + NOT_ID_CTX),
    Rule("GSTIN", _r(_NA + r"\d{2}[A-Za-z]{5}\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]" + _NZ),
         validator=gstin_ok, fallback_score=0.85, score=1.0),
    Rule("PAN", _r(_NA + r"[A-Za-z]{5}\d{4}[A-Za-z]" + _NZ),
         validator=pan_ok, fallback_score=0.7, context=PAN_CTX, score=1.0),
    Rule("IFSC", _r(_NA + r"[A-Z]{4}0[A-Z0-9]{6}" + _NZ), validator=ifsc_ok, score=0.95),
    Rule("PHONE", _r(r"(?<![\w+])(?:(?:\+|00)91[ -]?|0)?[6-9]\d{4}[ -]?\d{5}" + _NDZ), score=0.93,
         exclude=NOT_ID_CTX),
    Rule("VOTER_ID", _r(_NA + r"[A-Z]{3}\d{7}" + _NZ), score=0.85),
    Rule("DL", _r(_NA + r"[A-Z]{2}[ -]?\d{2}[ -]?(?:19|20)\d{2}[ -]?\d{7}" + _NZ), score=0.9),
    Rule("VEHICLE", _r(_NA + r"[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{1,3}[ -]?\d{4}" + _NZ), score=0.8),
    Rule("PASSPORT", _r(_NA + r"[A-PR-WY][1-9]\d ?\d{4}[1-9]" + _NZ),
         context=PASSPORT_CTX, context_required=True, score=0.9),
    Rule("BANK_ACCOUNT", _r(_ND + r"\d{9,18}" + _NDZ),
         context=ACCOUNT_CTX, context_required=True, score=0.9, window=50),
    Rule("DOB", _r(_ND + r"(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\d{2}" + _NDZ),
         context=DOB_CTX, context_required=True, score=0.9),
    Rule("DOB", _r(r"(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+" + _MONTHS + r",?\s+(?:19|20)\d{2}", re.I),
         context=DOB_CTX, context_required=True, score=0.9),
    Rule("PINCODE", _r(_ND + r"[1-9]\d{2} ?\d{3}" + _NDZ),
         context=PIN_CTX, context_required=True, score=0.85, window=25, exclude=NOT_ID_CTX),
]

# "Pune - 411001", "Mumbai, 400 001": a place name right before a 6-digit code
# (a capitalised word, so codes like "INV-123456" don't count).
_PIN_AFTER_PLACE = re.compile(r"(?:[A-Z][a-z]{2,}|[ऀ-ॿ]{3,})\s*[-–,]\s*$")

# ---------- labelled fields ("Name: Rahul Sharma", "Address: ...") ----------
# Forms put sensitive values right after a label. We mask the value up to the
# end of the line, or up to a wide gap before the next column.

_FIELD_LABELS: list[tuple[EntityType, str]] = [
    ("PERSON", r"(?:full |employee |patient |applicant |candidate |student |customer |account holder(?:'s)? |holder(?:'s)? )?name"),
    ("PERSON", r"(?:father|mother|husband|wife|spouse|guardian|parent)(?:'s)?(?: name)?"),
    ("PERSON", r"nominee(?: name)?"),
    ("PERSON", r"(?:passenger|traveller|traveler|guest|pax)(?: name)?"),
    ("PERSON", r"नाम|पिता का नाम|पति का नाम|माता का नाम|पालक"),
    ("ADDRESS", r"(?:permanent |residential |present |correspondence |current |home |postal )?address|addr\.?|पता|पत्ता"),
    ("OTHER", r"(?:employee|emp|customer|cust|member|patient|student|consumer|policy|claim|ticket|loan|application)\s*(?:id|no\.?|number|code)"),
    ("OTHER", r"(?:roll|enrol(?:l)?ment|registration|reg\.?|uhid|mrn|ration card|admission)\s*(?:no\.?|number|id)?"),
    ("OTHER", r"pnr(?:\s*(?:no\.?|number))?|booking\s*(?:ref(?:erence)?|id|no\.?)|e-?ticket\s*(?:no\.?|number)?|ticket\s*(?:no\.?|number)|frequent flyer(?:\s*no\.?)?"),
]
_FIELD_RE = re.compile(
    r"(?im)(?:^|(?<=[\s|,;(]))(?P<label>" + "|".join(f"(?:{p})" for _, p in _FIELD_LABELS) + r")"
    r"\s*[:：\-–]\s*(?P<value>[^\n|]+?)(?=\s{3,}|\s*\||\n|$)"
)
_FIELD_TYPES = [(t, re.compile(rf"^(?:{p})$", re.I)) for t, p in _FIELD_LABELS]
# Relations written without a colon: "S/o Suresh Verma", "W/O Ramesh".
_RELATION_RE = re.compile(r"(?i)\b(?:s|d|w|c)\s*/\s*o\.?\s+(?P<value>[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .]{1,40}?)(?=[,\n]|$|\s{2,})")


# Names after a greeting, honorific or introduction: "Dear Rahul Sharma",
# "Dr. Meera Iyer", "Billed to Amit Shah", "मेरा नाम सुनीता पाटिल है".
_CAP_NAME = r"[A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,3}"
_NAME_CONTEXT = [
    re.compile(r"\b(?:Dear(?:\s+(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt|Sri|Prof)\.?)?|Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Shri\.?|Smt\.?|Sri\.?|Kumari|Prof\.?)\s+(?P<value>" + _CAP_NAME + ")"),
    re.compile(r"(?i:\b(?:billed to|bill to|attn\.?:?|attention:?|signed by|treated by|referred by|i am|i'm|my name is|this is))\s+(?:Dr\.?\s+)?(?P<value>" + _CAP_NAME + ")"),
    re.compile(r"(?:मेरा नाम|मेरे नाव|माझे नाव|नाम)\s+(?P<value>[\u0900-\u097F]+(?:\s[\u0900-\u097F]+){0,2}?)\s+(?:है|आहे|हूँ|हूं)"),
]
_NOT_NAMES = {"Mr", "Mrs", "Ms", "Miss", "Dr", "Shri", "Smt", "Sri", "Prof", "Kumari", "Sir", "Madam", "Team", "Customer", "User", "Patient", "Applicant", "All", "Friend", "Here", "Sure", "Not", "Very", "Sorry", "Happy", "Good", "Fine", "Glad", "Writing", "Looking"}


def _context_names(text: str) -> list[Entity]:
    out = []
    for rx in _NAME_CONTEXT:
        for m in rx.finditer(text):
            value = m.group("value")
            if value.split()[0] in _NOT_NAMES:
                continue
            s = m.start("value")
            out.append(Entity(start=s, end=s + len(value), type="PERSON", value=value, source="rule", score=0.85))
    return out


def find_terms(text: str, terms: list[str]) -> list[Entity]:
    """Every occurrence of the user's own words (case-insensitive, whole words)."""
    out = []
    for term in {t.strip() for t in terms if len(t.strip()) >= 2}:
        body = r"\s+".join(re.escape(w) for w in term.split())
        left = r"(?<![\wऀ-෿])" if (term[0].isalnum() or "ऀ" <= term[0] <= "෿") else ""
        right = r"(?![\wऀ-෿])" if (term[-1].isalnum() or "ऀ" <= term[-1] <= "෿") else ""
        for m in re.finditer(left + body + right, text, re.I):
            out.append(Entity(start=m.start(), end=m.end(), type="CUSTOM", value=m.group(0),
                              source="user", score=1.0))
    return out


def _field_type(label: str) -> EntityType:
    for t, rx in _FIELD_TYPES:
        if rx.match(label.strip()):
            return t
    return "OTHER"


def _labelled_fields(text: str) -> list[Entity]:
    out = []
    for m in _FIELD_RE.finditer(text):
        etype = _field_type(m.group("label"))
        s, e = m.span("value")
        value = m.group("value").rstrip(" .,;")
        e = s + len(value)
        if len(value.strip()) < 2:
            continue
        # A "name" with digits or a long sentence isn't a name.
        if etype == "PERSON" and (any(ch.isdigit() for ch in value) or len(value.split()) > 6):
            continue
        out.append(Entity(start=s, end=e, type=etype, value=value, source="rule", score=0.88))
    for m in _RELATION_RE.finditer(text):
        s, e = m.span("value")
        out.append(Entity(start=s, end=e, type="PERSON", value=m.group("value"), source="rule", score=0.88))
    return out


def _has_context(text: str, start: int, words: list[str], window: int) -> bool:
    if not words:
        return False
    before = text[max(0, start - window):start].lower()
    return any(w in before for w in words)


def find(text: str) -> list[Entity]:
    """All rule matches in `text` (already normalized). Overlaps are resolved later in merge.py."""
    out: list[Entity] = []
    for rule in RULES:
        for m in rule.pattern.finditer(text):
            s, e = m.span()
            value = m.group(0)
            if _has_context(text, s, rule.exclude, 25):
                continue
            has_ctx = _has_context(text, s, rule.context, rule.window)

            if rule.type == "PINCODE" and not has_ctx:
                has_ctx = bool(_PIN_AFTER_PLACE.search(text[max(0, s - 30):s]))

            if rule.context_required and not has_ctx:
                continue

            score, validated = rule.score, False
            if rule.validator:
                if rule.validator(value):
                    validated = True
                elif rule.fallback_score is not None and has_ctx:
                    score = rule.fallback_score
                else:
                    continue
            elif has_ctx:
                score = round(min(1.0, score + 0.05), 3)

            out.append(Entity(start=s, end=e, type=rule.type, value=value,
                              source="rule", score=score, validated=validated))
    return out + _labelled_fields(text) + _context_names(text)
