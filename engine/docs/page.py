"""A page of text where every character knows where it sits on the page image.

Both the PDF text layer and OCR produce a PageText, so detection and
redaction work the same way for digital PDFs, scanned PDFs and photos.
"""

from dataclasses import dataclass, field

Box = tuple[float, float, float, float]  # x0, y0, x1, y1 in image pixels


@dataclass
class PageText:
    text: str = ""
    char_boxes: list[Box | None] = field(default_factory=list)  # same length as text

    def add(self, s: str, box: Box | None) -> None:
        self.text += s
        self.char_boxes.extend([box] * len(s))


def _same_line(a: Box, b: Box) -> bool:
    overlap = min(a[3], b[3]) - max(a[1], b[1])
    return overlap > 0.5 * min(a[3] - a[1], b[3] - b[1])


def boxes_for_span(page: PageText, start: int, end: int, pad: float = 3.0) -> list[Box]:
    """Bounding boxes covering text[start:end], one box per line it touches."""
    lines: list[Box] = []
    cur: Box | None = None
    for i in range(start, min(end, len(page.char_boxes))):
        b = page.char_boxes[i]
        if page.text[i] == "\n":
            cur = None
            continue
        if b is None or b[2] <= b[0] or b[3] <= b[1]:
            continue
        if cur is not None and _same_line(cur, b):
            cur = (min(cur[0], b[0]), min(cur[1], b[1]), max(cur[2], b[2]), max(cur[3], b[3]))
            lines[-1] = cur
        else:
            cur = b
            lines.append(cur)
    return [(x0 - pad, y0 - pad, x1 + pad, y1 + pad) for x0, y0, x1, y1 in lines]
