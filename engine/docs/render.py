"""Draw redactions onto page images.

Text items: a black box with the placeholder (e.g. [AADHAAR_1]) printed
inside in white, so the chatbot can still refer to it and Kavach can put
the real value back on screen.
QR codes / barcodes and faces: pixelated and blurred until unreadable.
"""

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .page import Box

_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]
_FONT_PATH = next((p for p in _FONT_CANDIDATES if Path(p).exists()), None)


def _font(size: int) -> ImageFont.FreeTypeFont:
    if _FONT_PATH:
        return ImageFont.truetype(_FONT_PATH, size)
    return ImageFont.load_default(size=size)


def _label_box(draw: ImageDraw.ImageDraw, box: Box, label: str, img_w: int) -> None:
    x0, y0, x1, y1 = box
    h = y1 - y0
    size = max(8, int(h * 0.75))
    font = _font(size)
    while size > 8 and draw.textlength(label, font=font) > (x1 - x0) * 0.95:
        size -= 1
        font = _font(size)
    text_w = draw.textlength(label, font=font)
    # If the label still doesn't fit, widen the box (covering more is always safe).
    if text_w > (x1 - x0) * 0.95:
        x1 = min(img_w, x0 + text_w + 6)
    draw.rectangle((x0, y0, x1, y1), fill=(0, 0, 0))
    ty = y0 + (h - size) / 2 - size * 0.1
    draw.text((x0 + max(2, ((x1 - x0) - text_w) / 2), ty), label, fill=(255, 255, 255), font=font)


def _blur(img: Image.Image, box: Box) -> None:
    x0, y0, x1, y1 = (int(v) for v in box)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return
    region = img.crop((x0, y0, x1, y1))
    small = region.resize((max(1, (x1 - x0) // 16), max(1, (y1 - y0) // 16)), Image.BILINEAR)
    region = small.resize(region.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(6))
    img.paste(region, (x0, y0))


def redact(img: Image.Image, regions: list[tuple[str, list[Box], str]]) -> Image.Image:
    """regions: (type, boxes, label). Returns a new image."""
    out = img.copy()
    draw = ImageDraw.Draw(out)
    for etype, boxes, label in regions:
        for i, box in enumerate(boxes):
            if etype in ("FACE", "QR"):
                _blur(out, box)
            elif i == 0 and label:
                _label_box(draw, box, label, out.width)
            else:
                draw.rectangle(box, fill=(0, 0, 0))
    return out


def to_bytes(img: Image.Image, fmt: str) -> bytes:
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.save(buf, "JPEG", quality=92)
    else:
        img.save(buf, fmt)
    return buf.getvalue()


def images_to_pdf(pages: list[Image.Image], dpi: int) -> bytes:
    """Rebuild a PDF from page images: nothing from the original text layer survives."""
    buf = io.BytesIO()
    pages[0].save(buf, "PDF", save_all=True, append_images=pages[1:], resolution=dpi)
    return buf.getvalue()


def preview(img: Image.Image, max_side: int = 1100) -> tuple[bytes, float]:
    """Downscaled JPEG for the review card, and the scale factor used."""
    scale = min(1.0, max_side / max(img.size))
    small = img if scale == 1.0 else img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=80)
    return buf.getvalue(), scale
