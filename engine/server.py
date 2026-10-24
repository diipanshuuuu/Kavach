"""Kavach local engine. Runs only on 127.0.0.1 — nothing leaves the laptop.

    uvicorn server:app --host 127.0.0.1 --port 8000
"""

import json
import logging
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from detect import detect, llm, ner
from docs import ocr, router
from schemas import (
    AnalyzeFileResponse,
    DetectRequest,
    DetectResponse,
    HealthResponse,
    RenderRequest,
    RenderResponse,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

MAX_FILE_BYTES = 25 * 1024 * 1024

app = FastAPI(title="Kavach engine", version="0.1.0")

# The extension calls us from its background worker (chrome-extension:// or
# moz-extension:// origin). We only listen on localhost, so any origin is fine.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _warm_up() -> None:
    # Load the NER model in the background so the server starts instantly.
    threading.Thread(target=lambda: ner.load() and ner.find("Rahul Sharma lives in Pune."), daemon=True).start()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, ner=ner.model_name() is not None, llm=llm.available(), ocr=ocr.available())


@app.get("/info")
def info() -> dict:
    from docs import visual

    return {
        "ner_model": ner.model_name(),
        "llm_model": llm.MODEL if llm.available() else None,
        "ocr_langs": ocr.langs() if ocr.available() else None,
        "face_detector": visual.face_backend(),
    }


@app.post("/detect", response_model=DetectResponse)
async def detect_text(req: DetectRequest) -> DetectResponse:
    entities, timing = await run_in_threadpool(detect, req.text, req.deep, req.terms)
    return DetectResponse(entities=entities, timing_ms=timing)


@app.post("/analyze-file", response_model=AnalyzeFileResponse)
async def analyze_file(
    file: UploadFile = File(...), deep: bool = Form(False), terms: str = Form("[]"),
) -> AnalyzeFileResponse:
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "File is larger than 25 MB.")
    try:
        term_list = [str(t) for t in json.loads(terms)][:200]
    except (ValueError, TypeError):
        term_list = []
    try:
        return await run_in_threadpool(
            router.analyze, file.filename or "file", file.content_type or "", data, deep, term_list)
    except router.UnsupportedFile as e:
        raise HTTPException(415, str(e))


@app.post("/render-redacted", response_model=RenderResponse)
async def render_redacted(req: RenderRequest) -> RenderResponse:
    try:
        return await run_in_threadpool(router.render_job, req)
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.get("/test", include_in_schema=False)
def test_page() -> FileResponse:
    """A stand-in chatbot page for testing the extension offline."""
    return FileResponse(Path(__file__).parent / "dev" / "test.html")
