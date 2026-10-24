"""Kavach detection engine: the one function everything else calls."""

import time

from schemas import Entity

from . import llm, ner, rules
from .merge import merge
from .normalize import normalize


def detect(text: str, deep: bool = False, terms: list[str] | None = None) -> tuple[list[Entity], dict[str, int]]:
    """Find sensitive data in `text`. Returns (entities, timing in ms per layer).

    `terms` are the user's own "always hide" words; they always win.
    """
    timing: dict[str, int] = {}
    norm = normalize(text)

    t = time.perf_counter()
    found = rules.find(norm) + rules.find_terms(norm, terms or [])
    timing["rules"] = int((time.perf_counter() - t) * 1000)

    t = time.perf_counter()
    found += ner.find(norm)
    timing["ner"] = int((time.perf_counter() - t) * 1000)

    if deep:
        t = time.perf_counter()
        found += llm.find(norm)
        timing["llm"] = int((time.perf_counter() - t) * 1000)

    return merge(found, text), timing
