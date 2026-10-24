"""PPTX: replace sensitive text with placeholders in place and redact pictures.

The output stays an editable deck. We walk every slide in a fixed order
(shapes, groups, tables, speaker notes, pictures) both when analyzing and
when rendering, so a paragraph's position in that walk is its stable key.
"""

import io
from collections.abc import Iterator

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.shapes.picture import Picture

# Picture formats Pillow can read and write back in the same format.
PIL_FORMATS = {"png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "gif": "GIF", "bmp": "BMP", "tiff": "TIFF", "tif": "TIFF"}


def _walk_shapes(shapes, label: str) -> Iterator[tuple[str, object, str]]:
    for sh in shapes:
        if sh.shape_type == MSO_SHAPE_TYPE.GROUP:
            yield from _walk_shapes(sh.shapes, label)
            continue
        if isinstance(sh, Picture):
            yield "picture", sh, f"{label} · Picture"
            continue
        if getattr(sh, "has_table", False) and sh.has_table:
            for r, row in enumerate(sh.table.rows):
                for c, cell in enumerate(row.cells):
                    yield "text", cell.text_frame, f"{label} · Table r{r + 1}c{c + 1}"
        elif sh.has_text_frame:
            yield "text", sh.text_frame, label


def walk(prs) -> Iterator[tuple[int, str, str, object, str]]:
    """Yield (slide_index, key, kind, obj, location) in a stable order.

    kind "para": obj is a paragraph; kind "picture": obj is a Picture shape.
    """
    for si, slide in enumerate(prs.slides):
        label = f"Slide {si + 1}"
        seq = 0
        parts = list(_walk_shapes(slide.shapes, label))
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
            parts.append(("text", slide.notes_slide.notes_text_frame, f"{label} · Notes"))
        for kind, obj, loc in parts:
            if kind == "picture":
                yield si, f"s{si}-pic{seq}", "picture", obj, loc
                seq += 1
            else:
                for para in obj.paragraphs:
                    yield si, f"s{si}-p{seq}", "para", para, loc
                    seq += 1


def para_text(para) -> str:
    return "".join(r.text for r in para.runs)


def open_deck(data: bytes):
    return Presentation(io.BytesIO(data))


def set_para_text(para, new_text: str) -> None:
    """Put the masked text in the first run (keeps its font/colour), empty the rest."""
    runs = para.runs
    if not runs:
        return
    runs[0].text = new_text
    for r in runs[1:]:
        r.text = ""


def replace_picture(pic: Picture, new_blob: bytes) -> None:
    part = pic.part.related_part(pic._element.blip_rId)
    part._blob = new_blob


def scrub_metadata(prs) -> None:
    cp = prs.core_properties
    for attr in ("author", "last_modified_by", "title", "subject", "keywords", "comments", "category"):
        try:
            setattr(cp, attr, "")
        except Exception:
            pass


def save(prs) -> bytes:
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
