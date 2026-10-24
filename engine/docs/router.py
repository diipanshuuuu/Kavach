"""File pipeline: pick the right reader, find sensitive items, render redactions.

Two steps so the user can review before anything is drawn:
  analyze(file)  -> job_id + pages with items and boxes
  render(job_id, chosen ids, placeholders, manual boxes, extra words)
      -> redacted file, same type as input
"""

import base64
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from detect import detect, rules
from detect.normalize import normalize
from schemas import AnalyzeFileResponse, FileItem, FilePage, RenderRequest, RenderResponse

from . import jobs, pptx_redact, render, visual
from .ocr import ocr_page, open_image
from .page import PageText, boxes_for_span
from .pdf import DPI, read_pdf

IMAGE_EXT = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}
MIME = {
    "PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp",
    "pdf": "application/pdf",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
MANUAL_LABEL = "[HIDDEN]"


class UnsupportedFile(Exception):
    pass


def kind_of(filename: str, mime: str) -> str | None:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXT or mime in ("image/png", "image/jpeg", "image/webp"):
        return "image"
    if ext == ".pdf" or mime == "application/pdf":
        return "pdf"
    if ext in (".pptx", ".ppt") or "presentationml" in mime or mime == "application/vnd.ms-powerpoint":
        return "pptx"
    return None


def _out_name(filename: str, ext: str | None = None) -> str:
    p = Path(filename)
    return f"{p.stem}_kavach{ext or p.suffix}"


# ---------- shared: one page image + its text ----------

def _find_items(img: Image.Image, text: PageText, prefix: str, location: str,
                deep: bool, terms: list[str]) -> list[dict]:
    items: list[dict] = []
    entities, _ = detect(text.text, deep=deep, terms=terms)
    for k, e in enumerate(entities):
        boxes = boxes_for_span(text, e.start, e.end)
        if boxes:
            items.append(dict(id=f"{prefix}-e{k}", type=e.type, value=e.value, source=e.source,
                              score=e.score, boxes=boxes, location=location))
    for k, b in enumerate(visual.find_codes(img)):
        items.append(dict(id=f"{prefix}-q{k}", type="QR", value="", source="vision", score=1.0,
                          boxes=[b], location=location))
    for k, b in enumerate(visual.find_faces(img)):
        items.append(dict(id=f"{prefix}-f{k}", type="FACE", value="", source="vision", score=0.9,
                          boxes=[b], location=location))
    return items


def _page_state(index: int, label: str, img: Image.Image, text: PageText, items: list[dict]) -> tuple[dict, FilePage]:
    """Internal state kept for rendering + the page as sent to the review card."""
    jpeg, scale = render.preview(img)
    page = FilePage(
        index=index, label=label,
        preview_b64=base64.b64encode(jpeg).decode(),
        width=int(img.width * scale), height=int(img.height * scale),
        items=[
            FileItem(**{**it, "boxes": [[round(v * scale, 1) for v in b] for b in it["boxes"]]})
            for it in items
        ],
    )
    return {"img": img, "text": text, "items": items, "scale": scale}, page


def _regions(state: dict, page_index: int, req: RenderRequest) -> list:
    """Everything to draw on one page: chosen items, manual boxes, extra words."""
    chosen, ph = set(req.chosen), req.placeholders
    regions = [
        (it["type"], it["boxes"], ph.get(it["id"], f"[{it['type']}]"))
        for it in state["items"] if it["id"] in chosen
    ]
    scale = state["scale"] or 1.0
    for b in req.custom_boxes.get(str(page_index), []):
        if len(b) == 4:
            regions.append(("CUSTOM", [tuple(v / scale for v in b)], ""))
    if req.terms:
        text: PageText = state["text"]
        for e in rules.find_terms(normalize(text.text), req.terms):
            boxes = boxes_for_span(text, e.start, e.end)
            if boxes:
                regions.append(("CUSTOM", boxes, MANUAL_LABEL))
    return regions


# ---------- legacy .ppt ----------

def _ppt_to_pptx(data: bytes) -> bytes:
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise UnsupportedFile("Old .ppt files need LibreOffice to convert. Please save as .pptx.")
    with tempfile.TemporaryDirectory() as d:
        src = Path(d) / "in.ppt"
        src.write_bytes(data)
        subprocess.run([soffice, "--headless", "--convert-to", "pptx", "--outdir", d, str(src)],
                       check=True, capture_output=True, timeout=60)
        return (Path(d) / "in.pptx").read_bytes()


# ---------- analyze ----------

def analyze(filename: str, mime: str, data: bytes, deep: bool = False,
            terms: list[str] | None = None) -> AnalyzeFileResponse:
    kind = kind_of(filename, mime)
    if kind is None:
        raise UnsupportedFile(f"Kavach can't scan this file type yet: {filename}")
    terms = terms or []
    pages_out: list[FilePage] = []

    if kind == "image":
        img = open_image(data)
        text = ocr_page(img)
        st, page = _page_state(0, "Image", img, text, _find_items(img, text, "p0", "Image", deep, terms))
        state = {"fmt": IMAGE_EXT.get(Path(filename).suffix.lower(), "PNG"), "pages": {0: st}}
        pages_out.append(page)

    elif kind == "pdf":
        state = {"pages": {}}
        for i, (img, text) in enumerate(read_pdf(data)):
            label = f"Page {i + 1}"
            st, page = _page_state(i, label, img, text, _find_items(img, text, f"p{i}", label, deep, terms))
            state["pages"][i] = st
            pages_out.append(page)

    else:  # pptx
        if Path(filename).suffix.lower() == ".ppt":
            data = _ppt_to_pptx(data)
            filename = Path(filename).stem + ".pptx"
        prs = pptx_redact.open_deck(data)
        # pics: preview page index -> picture state (keyed by its walk key)
        state = {"data": data, "paras": {}, "pics": {}, "pic_keys": {}}
        slide_items: dict[int, list[FileItem]] = {}
        next_pic_page = 1000
        for si, key, kind_, obj, loc in pptx_redact.walk(prs):
            if kind_ == "para":
                text = pptx_redact.para_text(obj)
                if not text.strip():
                    continue
                entities, _ = detect(text, deep=deep, terms=terms)
                for k, e in enumerate(entities):
                    item_id = f"{key}-e{k}"
                    state["paras"].setdefault(key, []).append((item_id, e.start, e.end, e.type))
                    slide_items.setdefault(si, []).append(FileItem(
                        id=item_id, type=e.type, value=e.value, source=e.source,
                        score=e.score, location=loc))
            else:
                fmt = pptx_redact.PIL_FORMATS.get(obj.image.ext.lower())
                if not fmt:
                    continue  # WMF/EMF etc.
                img = open_image(obj.image.blob)
                text = ocr_page(img)
                items = _find_items(img, text, key, loc, deep, terms)
                # Every picture gets a preview page, so the user can hide things by hand.
                st, page = _page_state(next_pic_page, loc, img, text, items)
                state["pics"][key] = {**st, "fmt": fmt}
                state["pic_keys"][next_pic_page] = key
                pages_out.append(page)
                next_pic_page += 1
        text_pages = [
            FilePage(index=si, label=f"Slide {si + 1}", items=its)
            for si, its in sorted(slide_items.items())
        ]
        pages_out = text_pages + pages_out

    job_id = jobs.put(jobs.Job(kind=kind, filename=filename, mime=mime, data=state))
    return AnalyzeFileResponse(job_id=job_id, kind=kind, filename=filename, pages=pages_out)


# ---------- render ----------

def _mask_para(text: str, spans: list[tuple], req: RenderRequest) -> str:
    chosen, ph = set(req.chosen), req.placeholders
    for item_id, s, e, etype in sorted(spans, key=lambda x: -x[1]):
        if item_id in chosen:
            text = text[:s] + ph.get(item_id, f"[{etype}]") + text[e:]
    if req.terms:
        for e in sorted(rules.find_terms(normalize(text), req.terms), key=lambda x: -x.start):
            text = text[:e.start] + MANUAL_LABEL + text[e.end:]
    return text


def render_job(req: RenderRequest) -> RenderResponse:
    job = jobs.get(req.job_id)
    if job is None:
        raise KeyError("This scan expired. Please upload the file again.")
    state = job.data

    if job.kind == "image":
        page = state["pages"][0]
        out = render.redact(page["img"], _regions(page, 0, req))
        fmt = state["fmt"]
        blob, mime, name = render.to_bytes(out, fmt), MIME[fmt], _out_name(job.filename)

    elif job.kind == "pdf":
        imgs = [render.redact(p["img"], _regions(p, i, req)) for i, p in sorted(state["pages"].items())]
        blob, mime, name = render.images_to_pdf(imgs, DPI), MIME["pdf"], _out_name(job.filename, ".pdf")

    else:
        prs = pptx_redact.open_deck(state["data"])
        page_of_pic = {k: i for i, k in state["pic_keys"].items()}
        for _, key, kind_, obj, _ in pptx_redact.walk(prs):
            if kind_ == "para":
                text = pptx_redact.para_text(obj)
                if text.strip() and (key in state["paras"] or req.terms):
                    new = _mask_para(text, state["paras"].get(key, []), req)
                    if new != text:
                        pptx_redact.set_para_text(obj, new)
            elif kind_ == "picture" and key in state["pics"]:
                pic = state["pics"][key]
                regions = _regions(pic, page_of_pic[key], req)
                if regions:
                    pptx_redact.replace_picture(obj, render.to_bytes(render.redact(pic["img"], regions), pic["fmt"]))
        pptx_redact.scrub_metadata(prs)
        blob, mime, name = pptx_redact.save(prs), MIME["pptx"], _out_name(job.filename, ".pptx")

    return RenderResponse(file_b64=base64.b64encode(blob).decode(), mime=mime, filename=name)
