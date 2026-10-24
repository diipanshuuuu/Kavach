"""Combine results from all layers into one clean, non-overlapping list.

Priority when two findings overlap:
  checksum-validated rule > rule > vision > NER > LLM
Ties go to the longer span. Public names on the allowlist are dropped.
"""

from schemas import Entity

# The user's own choices always win.
_PRIORITY = {"user": 6, "rule": 3, "vision": 3, "ner": 2, "llm": 1}

# Public organisations and generic words that NER/LLM sometimes tag.
ALLOWLIST = {
    "india", "bharat", "government of india", "govt of india", "government", "reserve bank of india",
    "rbi", "uidai", "income tax department", "income tax", "sbi", "state bank of india", "hdfc bank",
    "icici bank", "axis bank", "bank", "aadhaar", "pan", "gst", "upi", "chatgpt", "gemini", "claude",
    "भारत सरकार", "भारत", "आधार",
}


def _rank(e: Entity) -> tuple:
    # A full address beats the place names and PIN inside it: hiding more is safer.
    if e.source == "user":
        prio = _PRIORITY["user"]
    elif e.type == "ADDRESS":
        prio = 4
    else:
        prio = _PRIORITY[e.source] + (1 if e.validated else 0)
    return (prio, e.end - e.start, e.score)


def merge(entities: list[Entity], text: str, allowlist: set[str] | None = None) -> list[Entity]:
    allow = ALLOWLIST | {a.lower() for a in (allowlist or set())}
    candidates = [
        e for e in entities
        if e.end > e.start and (e.source == "user" or e.value.strip().lower() not in allow)
    ]
    user = [e for e in candidates if e.source == "user"]
    auto = sorted((e for e in candidates if e.source != "user"), key=_rank, reverse=True)

    taken: list[Entity] = []
    for e in auto:
        if not any(e.start < t.end and t.start < e.end for t in taken):
            taken.append(e)

    # The user's own words win, except when something larger already hides them
    # (a user word "Kothrud" inside a detected address keeps the whole address).
    for u in sorted(user, key=lambda e: e.start - e.end):
        if any(t.start <= u.start and u.end <= t.end for t in taken):
            continue
        taken = [t for t in taken if not (u.start < t.end and t.start < u.end)] + [u]

    taken = [e.model_copy(update={"value": text[e.start:e.end]}) for e in taken]

    taken.sort(key=lambda e: e.start)
    return taken
