# Kavach 🛡️

**A local privacy shield for AI chats.** Kavach is a Chrome/Firefox extension that finds Indian personal data (Aadhaar, PAN, bank details, names, addresses…) in anything you paste or upload into ChatGPT, Gemini or Claude, and masks it **before it leaves your laptop**. Detection runs on open-weight models on your own machine. When the chatbot replies with `[PERSON_1]`, Kavach shows you the real name again, on your screen only.

> Hacktoberfest Hack Day Pune 2026 · Track 1: Best Open-Source AI Project · Problem statement #3: PII redaction for Indian documents and languages

## What it protects

| Input | How |
|---|---|
| **Copy-paste text** | Caught before the site sees it → review card → masked text is pasted |
| **Images** (screenshots, phone photos of ID cards, boarding passes) | OCR → labelled black boxes; **every QR code and barcode blurred** (QR, PDF417, Aztec, DataMatrix, 1D; Aadhaar QRs and boarding-pass codes carry name, DOB, PNR…); **faces blurred** |
| **PDFs** (digital or scanned) | Text layer or OCR → redacted pages, **rebuilt from images so no hidden text survives** |
| **PowerPoint (.pptx)** | Text, tables and speaker notes rewritten with placeholders; pictures inside slides redacted; author metadata cleared; file stays editable |

Files are caught whether you use the 📎 button, drag and drop, or paste them.

### You stay in control: manual hiding

Detection is never perfect, and some things are private only to you. In every review card you can:

- **Text:** click any word to hide it, or type a phrase to hide every occurrence. Tick **Always hide** to remember it.
- **Files:** drag a box over anything on a page preview, or type a word to hide it everywhere in the file (PDF pages, image text, PPTX text).
- **Always hide list** (popup): your name, company or project code names are hidden in every paste and upload.

Hidden items become `[CUSTOM_n]` placeholders and are restored on screen like everything else.

### When the local engine isn't running: in-browser rules

Kavach never silently lets data through. A TypeScript port of the engine's rules and checksums runs inside the extension, and it matches the Python rules on all 157 test documents. Aadhaar, PAN, GSTIN, card, phone, email, UPI, IFSC, bank account, DOB, PIN, labelled form fields and your always-hide words are still masked, **without any network call**. Names in plain sentences need the engine's AI model, so the review card says so and you can click any word to hide it.

Without the engine, **files can't be scanned** (OCR runs in the engine), so uploads show the offline card.

## How it works

```
Paste / upload in ChatGPT ──► Kavach content script stops it (capture phase)
        │
        ▼  (background worker only; nothing goes to the cloud)
Kavach engine on http://127.0.0.1:8000
   1. Rules + checksums   Aadhaar (Verhoeff), PAN, GSTIN (mod-36), card (Luhn), IFSC,
                          phone, email, UPI, bank a/c, DOB, PIN, passport, DL, labelled
                          form fields ("Name:", "Address:", "पिता का नाम:")
   2. NER model            names, places, organisations in English + Indian languages
   3. Qwen3-4B (optional)  "deep scan": addresses, relatives, medical details, employee IDs
   4. Merge                overlaps resolved; checksum-validated rules win
   Files: PDF text layer / Tesseract OCR → same detector → zxing-cpp codes + YuNet faces
          (codes are only located and blurred, never decoded)
        │
        ▼
Review card: you untick anything you want to keep, then:
   text  → "[PERSON_1] … [AADHAAR_1]" is pasted
   files → a "_kavach" copy with labelled black boxes is uploaded
        │
        ▼
Chatbot replies with placeholders → Kavach swaps the real values back on screen only.
One click ("Show what the chatbot saw") flips back to the placeholders.
```

- **The same value always gets the same placeholder**, so `Rahul Sharma` is `[PERSON_1]` in a paste and in a PDF you upload later, and answers stay consistent.
- The placeholder map lives in `storage.session`: memory only, wiped when the browser closes, never sent anywhere.
- The review card is drawn in a **closed** Shadow DOM, so the chatbot page's own scripts can't read it.
- Indian-script digits (`८१६४ ३०३९ ९०५१`) are normalised without shifting text positions, so checksums work on Hindi and Marathi documents too.

## Evaluation

`python engine/eval/evaluate.py --llm 30` generates 150 synthetic Indian documents with known answers: bank letters, salary slips, KYC forms, chats (English and Hindi), discharge summaries, invoices, and meeting notes where names appear with no cue. It also adds **decoys** that must not be flagged: 12-digit order IDs that fail the Aadhaar checksum, invoice numbers, transaction IDs and timestamps.

See [docs/eval-results.md](docs/eval-results.md) for the latest run. Headline: rules alone miss most names and addresses that appear in plain sentences. Adding the open-weight NER model is what lifts recall to ~97%.

## Run it

```bash
# 1. system tools (macOS)
brew install tesseract tesseract-lang ollama
ollama pull qwen3:4b              # optional, for deep scan

# 2. engine
./run.sh                          # creates engine/.venv on first run, serves http://127.0.0.1:8000

# 3. extension
cd extension && npm install
npm run dev                       # opens Chrome with Kavach loaded
npm run build:firefox             # Firefox build in .output/firefox-mv2
```

Try it offline on the built-in test chat at **http://127.0.0.1:8000/test**. Demo files (all fake) are in [docs/demo-samples](docs/demo-samples); regenerate them with `engine/.venv/bin/python engine/eval/make_samples.py`.

Tests: `cd engine && .venv/bin/python -m pytest tests`

### Using AI4Bharat IndicNER

The engine tries **ai4bharat/IndicNER** first (11 Indian languages). It's a gated model on Hugging Face, so once: log in at huggingface.co, click "Agree" on the [model page](https://huggingface.co/ai4bharat/IndicNER), then run `engine/.venv/bin/hf auth login`. Until then, Kavach falls back to `Davlan/xlm-roberta-base-wikiann-ner` automatically. The popup shows which model is active.

## Models, tools and licenses

**Open-weight models** (all run locally)

| Model | Used for | License |
|---|---|---|
| [ai4bharat/IndicNER](https://huggingface.co/ai4bharat/IndicNER) | Names, places, orgs in 11 Indian languages (primary) | MIT |
| [Davlan/xlm-roberta-base-wikiann-ner](https://huggingface.co/Davlan/xlm-roberta-base-wikiann-ner) | Multilingual NER (fallback when IndicNER isn't available) | Not stated on model card; base model XLM-R is MIT |
| [Qwen3-4B](https://ollama.com/library/qwen3) via Ollama | Optional deep scan | Apache-2.0 |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) LSTM models (eng, hin, mar) | Reading images and scanned PDFs | Apache-2.0 |
| [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) (OpenCV Zoo) | Face detection for blurring | MIT |

**Libraries and tools**

| Tool | Purpose | License |
|---|---|---|
| FastAPI, Uvicorn, Pydantic | Local engine API | MIT / BSD-3 / MIT |
| Hugging Face Transformers, PyTorch | Running the NER model | Apache-2.0 / BSD-3 |
| httpx | Calling Ollama | BSD-3 |
| pypdfium2 (PDFium) | PDF text layer with character boxes, page rendering | Apache-2.0 / BSD-3 |
| pytesseract | Tesseract wrapper | Apache-2.0 |
| Pillow | Drawing redactions, writing PDFs | MIT-CMU |
| OpenCV (opencv-python-headless) | YuNet runtime, backup QR detection | Apache-2.0 |
| zxing-cpp | Finding QR codes and barcodes (QR, PDF417, Aztec, DataMatrix, 1D) | Apache-2.0 |
| python-pptx | Reading/rewriting PowerPoint | MIT |
| Faker, reportlab, pytest | Synthetic test data, demo PDFs, tests | MIT / BSD / MIT |
| Ollama | Local LLM runtime | MIT |
| WXT, Vite, TypeScript | Cross-browser extension build | MIT / MIT / Apache-2.0 |
| Playwright | End-to-end browser tests during development | Apache-2.0 |

We deliberately avoided PyMuPDF (AGPL) and img2pdf (LGPL) to keep the project permissively licensed.

**AI coding assistance:** parts of this code were written with Claude Code (Anthropic). The team reviewed it and can explain every module: the architecture above, the checksum algorithms, the merge priorities, and the paste/upload interception.

## Limitations (honest list)

- Files added through cloud connectors (Google Drive, OneDrive) never pass through the browser, so Kavach can't see them.
- Handwriting and very low-quality photos OCR poorly; anything OCR misses can't be redacted. Always check the review card.
- Restored values are written into the page so you can read them; the chatbot's servers never receive them, but the page's own scripts could read the rendered text.
- Kavach's placeholders are only as good as detection: the review card exists so a human makes the final call.
## Project layout

```
engine/            Python · FastAPI · runs on 127.0.0.1 only
  detect/          normalize → rules (+validators) → ner → llm → merge
  docs/            PDF / OCR / PPTX readers, QR + face detection, redaction rendering
  eval/            synthetic dataset + evaluation, demo sample generator
  dev/test.html    offline stand-in chatbot for testing
  tests/           pytest
extension/         TypeScript · WXT (Chrome MV3 + Firefox)
  entrypoints/     background worker, content script, popup
  components/      review cards, toasts (closed Shadow DOM)
  lib/             engine client, vault, masking, restoring, files
docs/              demo samples, evaluation results
```

## License

[MIT](LICENSE)
