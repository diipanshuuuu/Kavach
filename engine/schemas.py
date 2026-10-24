"""Shared data shapes for the Kavach engine.

This is the contract between the engine and the extension.
Keep it in sync with extension/lib/types.ts — change both in the same commit.
"""

from typing import Literal

from pydantic import BaseModel, Field

EntityType = Literal[
    # people, places, context (found by IndicNER / Qwen)
    "PERSON", "LOCATION", "ORG", "ADDRESS", "MEDICAL", "OTHER",
    # Indian identifiers (found by rules)
    "AADHAAR", "VID", "PAN", "GSTIN", "VOTER_ID", "PASSPORT", "DL", "VEHICLE",
    # financial
    "IFSC", "BANK_ACCOUNT", "CARD", "UPI",
    # contact and dates
    "PHONE", "EMAIL", "DOB", "PINCODE",
    # visual regions in images/PDFs (found by OpenCV / zxing)
    "QR", "FACE",
    # anything the user chose to hide themselves
    "CUSTOM",
]

Source = Literal["rule", "ner", "llm", "vision", "user"]


class Entity(BaseModel):
    """One piece of sensitive data found in a text.

    start/end are character offsets into the ORIGINAL text (end is exclusive),
    so text[start:end] == value.
    """

    start: int
    end: int
    type: EntityType
    value: str
    source: Source
    score: float = Field(ge=0.0, le=1.0)
    validated: bool = False  # True when a checksum (Verhoeff, Luhn, ...) passed


# ---------- POST /detect ----------

class DetectRequest(BaseModel):
    text: str
    deep: bool = False  # also run the Qwen3 deep scan
    terms: list[str] = []  # the user's "always hide" words


class DetectResponse(BaseModel):
    entities: list[Entity]
    timing_ms: dict[str, int] = {}


# ---------- GET /health ----------

class HealthResponse(BaseModel):
    ok: bool
    ner: bool
    llm: bool
    ocr: bool


# ---------- POST /analyze-file ----------

class FileItem(BaseModel):
    """A sensitive item inside a file, with where it is on the page."""

    id: str  # stable id inside the job, e.g. "p0-e3"
    type: EntityType
    value: str = ""  # empty for QR / FACE
    source: Source
    score: float = 1.0
    # [x0, y0, x1, y1] boxes in preview pixels, one per line the item spans.
    # Empty for PPTX text, which is replaced in place instead of boxed.
    boxes: list[list[float]] = []
    location: str = ""  # human label, e.g. "Slide 3 · Table" or "Page 1"


class FilePage(BaseModel):
    index: int
    label: str = ""  # e.g. "Page 2", "Slide 3", "Slide 3 · Picture 1"
    preview_b64: str | None = None  # JPEG preview; None for PPTX text-only slides
    width: int = 0  # preview size in pixels
    height: int = 0
    items: list[FileItem]


class AnalyzeFileResponse(BaseModel):
    job_id: str
    kind: Literal["image", "pdf", "pptx"]
    filename: str
    pages: list[FilePage]


# ---------- POST /render-redacted ----------

class RenderRequest(BaseModel):
    job_id: str
    chosen: list[str]  # FileItem ids to redact
    placeholders: dict[str, str] = {}  # FileItem id -> "[PERSON_1]" (assigned by the extension's vault)
    # Manual hiding from the review card:
    custom_boxes: dict[str, list[list[float]]] = {}  # page index -> boxes in preview pixels
    terms: list[str] = []  # extra words to hide everywhere in the file


class RenderResponse(BaseModel):
    file_b64: str
    mime: str
    filename: str
