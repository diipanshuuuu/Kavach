"""PDF pages -> (page image, PageText).

Digital PDFs: read the text layer with exact per-character boxes (accurate, fast).
Scanned PDFs: no usable text layer, so OCR the rendered page.
"""

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image

from .ocr import ocr_page
from .page import PageText

DPI = 170
MAX_PAGES = 20
MIN_TEXT_CHARS = 20  # fewer real characters than this -> treat page as scanned


def _text_layer(page: pdfium.PdfPage, scale: float) -> PageText:
    tp = page.get_textpage()
    _, height = page.get_size()
    out = PageText()
    for i in range(tp.count_chars()):
        code = pdfium_c.FPDFText_GetUnicode(tp.raw, i)
        ch = chr(code) if code else " "
        if ch == "\r":
            ch = " "
        left, bottom, right, top = tp.get_charbox(i, loose=True)
        box = None
        if right > left and top > bottom and not ch.isspace():
            box = (left * scale, (height - top) * scale, right * scale, (height - bottom) * scale)
        out.add(ch, box)
    tp.close()
    return out


def read_pdf(data: bytes) -> list[tuple[Image.Image, PageText]]:
    pdf = pdfium.PdfDocument(data)
    scale = DPI / 72
    pages = []
    for i in range(min(len(pdf), MAX_PAGES)):
        page = pdf[i]
        img = page.render(scale=scale).to_pil().convert("RGB")
        text = _text_layer(page, scale)
        if sum(ch.isalnum() for ch in text.text) < MIN_TEXT_CHARS:
            text = ocr_page(img)
        pages.append((img, text))
        page.close()
    pdf.close()
    return pages
