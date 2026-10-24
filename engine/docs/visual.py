"""Sensitive regions that aren't text: QR codes, barcodes and faces.

Codes hide personal data: the QR on an Aadhaar card holds name, DOB, address
and photo; a boarding pass PDF417/Aztec code holds name, PNR and flight.
We only find where codes are (zxing-cpp, Apache-2.0) and blur them; we never
read their contents. OpenCV's QR detector is a backup.
Faces: OpenCV YuNet (open-weight, from OpenCV Zoo). run.sh downloads the
model file; without it, face detection is skipped (and /info says so).
"""

import logging
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .page import Box

log = logging.getLogger("kavach.visual")

YUNET_PATH = Path(__file__).resolve().parent.parent / "models" / "face_detection_yunet_2023mar.onnx"


def _pad(box: Box, frac: float, w: int, h: int) -> Box:
    x0, y0, x1, y1 = box
    px, py = (x1 - x0) * frac, (y1 - y0) * frac
    return (max(0, x0 - px), max(0, y0 - py), min(w, x1 + px), min(h, y1 + py))


def _overlaps(a: Box, b: Box) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _zxing_boxes(img: Image.Image) -> list[Box]:
    try:
        import zxingcpp
    except ImportError:
        return []
    boxes = []
    for r in zxingcpp.read_barcodes(img, formats=zxingcpp.BarcodeFormat.AllReadable):
        p = r.position
        xs = [p.top_left.x, p.top_right.x, p.bottom_left.x, p.bottom_right.x]
        ys = [p.top_left.y, p.top_right.y, p.bottom_left.y, p.bottom_right.y]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def _opencv_qr_boxes(img: Image.Image) -> list[Box]:
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    detectors = [cv2.QRCodeDetector()]
    if hasattr(cv2, "QRCodeDetectorAruco"):
        detectors.append(cv2.QRCodeDetectorAruco())
    for det in detectors:
        try:
            ok, pts = det.detectMulti(arr)
        except cv2.error:
            continue
        if ok and pts is not None:
            return [(q[:, 0].min(), q[:, 1].min(), q[:, 0].max(), q[:, 1].max()) for q in pts]
    return []


def find_codes(img: Image.Image) -> list[Box]:
    """Boxes around every QR code / barcode (QR, PDF417, Aztec, DataMatrix, 1D)."""
    boxes: list[Box] = []
    for b in _zxing_boxes(img) + _opencv_qr_boxes(img):
        b = _pad(b, 0.08, img.width, img.height)
        if not any(_overlaps(b, k) for k in boxes):
            boxes.append(b)
    return [tuple(float(v) for v in b) for b in boxes]


_yunet = None


def find_faces(img: Image.Image) -> list[Box]:
    global _yunet
    if not YUNET_PATH.exists():
        return []
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    boxes: list[Box] = []
    try:
        if _yunet is None:
            _yunet = cv2.FaceDetectorYN.create(str(YUNET_PATH), "", (w, h), 0.75, 0.3, 5000)
        _yunet.setInputSize((w, h))
        _, faces = _yunet.detect(bgr)
        for f in faces if faces is not None else []:
            x, y, fw, fh = f[:4]
            boxes.append(_pad((x, y, x + fw, y + fh), 0.25, w, h))
    except Exception as e:
        log.warning("face detection failed: %s", e)
    return [tuple(float(v) for v in b) for b in boxes]


def face_backend() -> str | None:
    return "yunet" if YUNET_PATH.exists() else None
