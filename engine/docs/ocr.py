"""OCR with Tesseract: image -> PageText with a box for every character."""

import os
import shutil

from PIL import Image, ImageOps

from .page import PageText

WANTED_LANGS = os.environ.get("KAVACH_OCR_LANGS", "eng+hin+mar").split("+")
MIN_CONF = 30

_langs: str | None = None


def available() -> bool:
    return shutil.which("tesseract") is not None


def langs() -> str:
    """The wanted languages that are actually installed, e.g. 'eng+hin'."""
    global _langs
    if _langs is None:
        import pytesseract

        installed = set(pytesseract.get_languages(config=""))
        chosen = [l for l in WANTED_LANGS if l in installed] or ["eng"]
        _langs = "+".join(chosen)
    return _langs


def ocr_page(img: Image.Image) -> PageText:
    import pytesseract
    from pytesseract import Output

    # Small screenshots OCR badly; upscale for recognition, then map boxes back.
    scale = 2.0 if max(img.size) < 1400 else 1.0
    work = ImageOps.grayscale(img)
    if scale != 1.0:
        work = work.resize((int(work.width * scale), int(work.height * scale)), Image.LANCZOS)

    d = pytesseract.image_to_data(work, lang=langs(), config="--psm 3", output_type=Output.DICT)

    page = PageText()
    last_line = None
    for i, word in enumerate(d["text"]):
        word = (word or "").strip()
        if not word or float(d["conf"][i]) < MIN_CONF:
            continue
        line_key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
        if last_line is not None:
            page.add("\n" if line_key != last_line else " ", None)
        last_line = line_key
        x, y, w, h = (d[k][i] / scale for k in ("left", "top", "width", "height"))
        # Spread the word box over its characters so partial matches get partial boxes.
        n = len(word)
        for j, ch in enumerate(word):
            page.add(ch, (x + w * j / n, y, x + w * (j + 1) / n, y + h))
    return page


def open_image(data: bytes) -> Image.Image:
    import io

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # phone photos are often stored rotated
    return img.convert("RGB")
