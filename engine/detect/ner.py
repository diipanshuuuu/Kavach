"""Layer 2: named-entity recognition with an open-weight multilingual model.

Default: AI4Bharat IndicNER (English + 11 Indian languages, MIT).
It is gated on Hugging Face (log in + accept once), so we fall back to
Davlan/xlm-roberta-base-wikiann-ner (WikiANN, 176 languages) if it can't load.
Override with KAVACH_NER_MODEL="model/a,model/b".
"""

import logging
import os
import re
import threading

from schemas import Entity

log = logging.getLogger("kavach.ner")

MODELS = os.environ.get(
    "KAVACH_NER_MODEL", "ai4bharat/IndicNER,Davlan/xlm-roberta-base-wikiann-ner"
).split(",")

LABELS = {"PER": "PERSON", "LOC": "LOCATION", "ORG": "ORG"}
MIN_SCORE = 0.5
CHUNK_CHARS = 400  # long sentences are split further; stays well under 512 tokens

# The models are most accurate one sentence at a time.
_SENT_END = re.compile(r"(?<=[.!?।|])\s+|\n+")
_ABBREV = re.compile(r"\b(?:mr|mrs|ms|dr|shri|smt|sri|kum|no|prof|st)\.$", re.I)
_HONORIFIC = re.compile(r"(?:\b(?:mr|mrs|ms|dr|shri|smt|sri|kumari|prof)\.?|श्री|श्रीमती|कुमारी|डॉ\.?)\s*$", re.I)

# Models over-tag form labels and headings as ORG/LOC. Filter them out.
_LABEL_WORDS = {
    "name", "mobile", "phone", "email", "address", "gender", "male", "female", "dob", "date", "details",
    "salary", "basic salary", "hra", "net pay", "gross pay", "professional tax", "income tax", "tds",
    "gstin", "ifsc", "pan", "aadhaar", "aadhaar no", "upi", "account", "bank", "branch", "signature",
    "specimen", "identity card", "id card", "id proof", "employee id", "total", "amount", "invoice",
    "dear", "regards", "thanks", "thank you", "sincerely", "branch manager", "manager", "hr", "kavach",
    "order id", "employer", "txn", "dr", "reference", "kyc", "kyc form", "form",
    "नाम", "पता", "मोबाइल", "संपर्क", "जन्म तिथि",
}
# Everyday words that never appear inside a person's or company's name.
_COMMON_WORDS = {
    "a", "an", "the", "of", "to", "is", "my", "your", "you", "me", "for", "and", "with", "can", "please",
    "help", "write", "number", "form", "details", "summary", "slip", "order", "tracking", "complaint",
    "account", "reference", "invoice", "salary", "payment", "date", "id", "no",
}
_LATIN = re.compile(r"^[A-Za-z][A-Za-z .'&-]*$")
_ORG_SUFFIX = re.compile(
    r"\b(?:pvt|private|ltd|limited|llp|inc|corp|corporation|company|co\.|technologies|solutions|"
    r"services|industries|enterprises|bank|school|college|university|institute|hospital|clinic|"
    r"trust|foundation|society)\b", re.I)
MIN_SCORE_BY_TYPE = {"PERSON": 0.5, "LOCATION": 0.7, "ORG": 0.9}


def _keep(text: str, s: int, e: int, etype: str, score: float) -> bool:
    value = text[s:e]
    if any(ch.isdigit() for ch in value) or any(ch in value for ch in ":/\n।|"):
        return False
    if value.strip().lower() in _LABEL_WORDS or len(value.strip()) < 3:
        return False
    if re.match(r"\s*[:：]", text[e:e + 3]):  # "Mobile:" is a label, not a value
        return False
    words = value.split()
    if any(w.lower().strip(".,") in _COMMON_WORDS for w in words):
        return False
    if etype == "ORG" and _ORG_SUFFIX.search(value):
        return True
    if etype == "ORG":
        # Without "Pvt Ltd"/"Bank"/... only Title Case English names count as organisations.
        if not _LATIN.match(value) or not all(w[0].isupper() for w in words):
            return False
    return score >= MIN_SCORE_BY_TYPE[etype]

_pipe = None
_model_name: str | None = None
_lock = threading.Lock()
_failed = False


def load() -> bool:
    """Load the first model that works. Safe to call many times."""
    global _pipe, _model_name, _failed
    if _pipe is not None or _failed:
        return _pipe is not None
    with _lock:
        if _pipe is not None:
            return True
        from transformers import pipeline

        for name in MODELS:
            name = name.strip()
            try:
                _pipe = pipeline("token-classification", model=name,
                                 aggregation_strategy="simple", device="cpu")
                _model_name = name
                log.info("NER model loaded: %s", name)
                return True
            except Exception as e:  # gated, offline, incompatible...
                log.warning("NER model %s failed to load: %s", name, e)
        _failed = True
        return False


def model_name() -> str | None:
    return _model_name


def _sentences(text: str) -> list[tuple[int, str]]:
    """(offset, sentence) pieces. Abbreviations like "Mr." don't end a sentence."""
    spans, start = [], 0
    for m in _SENT_END.finditer(text):
        if "\n" not in m.group(0) and _ABBREV.search(text[start:m.start()]):
            continue
        spans.append((start, m.start()))
        start = m.end()
    spans.append((start, len(text)))

    out = []
    for s, e in spans:
        while e - s > CHUNK_CHARS:  # very long "sentence": cut at a space
            k = text.rfind(" ", s, s + CHUNK_CHARS)
            k = k if k > s + CHUNK_CHARS // 2 else s + CHUNK_CHARS
            out.append((s, text[s:k]))
            s = k
        if text[s:e].strip():
            out.append((s, text[s:e]))
    return out


def _is_word_char(ch: str) -> bool:
    # Letters plus Indic combining marks (matras, viramas), which are not isalpha().
    return ch.isalpha() or "ऀ" <= ch <= "෿"


def _expand(text: str, s: int, e: int) -> tuple[int, int]:
    """Grow a span to whole words and trim punctuation/space at the edges."""
    while s > 0 and _is_word_char(text[s - 1]):
        s -= 1
    while e < len(text) and _is_word_char(text[e]):
        e += 1
    while s < e and not (_is_word_char(text[s]) or text[s].isdigit()):
        s += 1
    while e > s and not (_is_word_char(text[e - 1]) or text[e - 1].isdigit()):
        e -= 1
    return s, e


def find(text: str) -> list[Entity]:
    if not text.strip() or not load():
        return []

    sents = _sentences(text)
    results = _pipe([s for _, s in sents]) if sents else []
    if sents and isinstance(results[0], dict):  # a single input returns a flat list
        results = [results]

    raw: list[tuple[int, int, str, float]] = []
    for (off, _), found in zip(sents, results):
        for r in found:
            label = re.sub(r"^[BI]-", "", r.get("entity_group") or r.get("entity", ""))
            etype = LABELS.get(label)
            score = float(r["score"])
            if not etype or score < MIN_SCORE or r.get("start") is None:
                continue
            s, e = _expand(text, off + r["start"], off + r["end"])
            if e - s < 2:
                continue
            # "Mr. Rahul Sharma" tagged as ORG is still a person.
            if etype != "PERSON" and _HONORIFIC.search(text[max(0, s - 10):s]):
                etype = "PERSON"
            raw.append((s, e, etype, score))

    # Join pieces of the same type that overlap or touch ("सुन" + "ीता पाटिल",
    # "Rahul" + " Sharma").
    raw.sort()
    joined: list[list] = []
    for s, e, t, sc in raw:
        last = joined[-1] if joined else None
        if last and last[2] == t and s <= last[1] + 1 and text[last[1]:s].strip() == "":
            last[1] = max(last[1], e)
            last[3] = max(last[3], sc)
        elif last and s < last[1]:
            continue  # overlapping different type: keep the first
        else:
            joined.append([s, e, t, sc])

    return [
        Entity(start=s, end=e, type=t, value=text[s:e], source="ner", score=round(sc, 3))
        for s, e, t, sc in joined
        if _keep(text, s, e, t, sc)
    ]
