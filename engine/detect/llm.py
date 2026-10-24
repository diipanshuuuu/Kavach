"""Layer 3 (optional "deep scan"): a small local LLM via Ollama.

Catches what patterns and NER miss: full addresses, relatives' names,
medical conditions, employee IDs. Default model Qwen3-4B (Apache-2.0).

We never trust the model's offsets: it returns exact substrings and we find
them in the original text ourselves, dropping anything that isn't there.
"""

import logging
import os
import time

import httpx

from schemas import Entity

log = logging.getLogger("kavach.llm")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.environ.get("KAVACH_LLM_MODEL", "qwen3:4b")
TIMEOUT_S = float(os.environ.get("KAVACH_LLM_TIMEOUT", "25"))
CHUNK_CHARS = 3000

ALLOWED = {"PERSON", "ADDRESS", "MEDICAL", "ORG", "LOCATION", "DOB", "OTHER"}

SYSTEM = """You find personal information in Indian documents so it can be hidden before the text is sent to a cloud service.
Return every substring that identifies or describes a real private person:
- PERSON: names of people (including relatives, e.g. father's or husband's name), in any script
- ADDRESS: house/flat numbers, street, locality, full postal addresses
- MEDICAL: diagnoses, conditions, medicines tied to a person
- DOB: dates of birth
- ORG: a private employer or school that identifies the person
- OTHER: employee IDs, roll numbers, customer IDs, policy numbers, signatures
Copy each item EXACTLY as it appears in the text (same spelling, same script). Do not invent items.
Skip public organisations (banks, government departments) and generic words."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "type": {"type": "string", "enum": sorted(ALLOWED)},
                },
                "required": ["text", "type"],
            },
        }
    },
    "required": ["items"],
}

_available: tuple[float, bool] = (0.0, False)


def available() -> bool:
    """Is Ollama running with our model pulled? Cached for 30 s."""
    global _available
    checked_at, ok = _available
    if time.time() - checked_at < 30:
        return ok
    try:
        tags = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=1.5).json()
        names = {m["name"] for m in tags.get("models", [])}
        ok = MODEL in names or f"{MODEL}:latest" in names
    except Exception:
        ok = False
    _available = (time.time(), ok)
    return ok


def _ask(chunk: str, deadline: float) -> list[dict]:
    remaining = deadline - time.time()
    if remaining <= 1:
        return []
    resp = httpx.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": MODEL,
            "stream": False,
            "think": False,
            "format": SCHEMA,
            "options": {"temperature": 0},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": chunk},
            ],
        },
        timeout=remaining,
    )
    resp.raise_for_status()
    import json

    return json.loads(resp.json()["message"]["content"]).get("items", [])


def _locate(text: str, needle: str) -> list[tuple[int, int]]:
    spans, i = [], text.find(needle)
    while i != -1:
        spans.append((i, i + len(needle)))
        i = text.find(needle, i + len(needle))
    if not spans:  # retry ignoring case
        low, nlow = text.lower(), needle.lower()
        i = low.find(nlow)
        while i != -1:
            spans.append((i, i + len(needle)))
            i = low.find(nlow, i + len(needle))
    return spans


def find(text: str) -> list[Entity]:
    if not text.strip() or not available():
        return []
    deadline = time.time() + TIMEOUT_S
    out: list[Entity] = []
    seen: set[tuple[int, int]] = set()
    for i in range(0, len(text), CHUNK_CHARS):
        try:
            items = _ask(text[i:i + CHUNK_CHARS], deadline)
        except Exception as e:
            log.warning("deep scan failed: %s", e)
            break
        for it in items:
            needle = (it.get("text") or "").strip()
            etype = it.get("type")
            if len(needle) < 3 or etype not in ALLOWED:
                continue
            for s, e in _locate(text, needle):
                if (s, e) not in seen:
                    seen.add((s, e))
                    out.append(Entity(start=s, end=e, type=etype, value=text[s:e],
                                      source="llm", score=0.8))
    return out
