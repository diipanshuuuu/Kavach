"""Generate FAKE demo documents into docs/demo-samples/.

Every name and number here is synthetic. Identifier numbers are made to pass
their checksums so Kavach treats them as real-looking. The ID card is a
generic "SPECIMEN" layout, not a copy of any real government card.

    python eval/make_samples.py
"""

import io
import random
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from detect.validators import gstin_check_char, verhoeff_check_digit  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "docs" / "demo-samples"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_B = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
random.seed(7)


def fake_aadhaar() -> str:
    base = str(random.randint(2, 9)) + "".join(random.choice("0123456789") for _ in range(10))
    n = base + verhoeff_check_digit(base)
    return f"{n[:4]} {n[4:8]} {n[8:]}"


AADHAAR_1, AADHAAR_2 = fake_aadhaar(), fake_aadhaar()
PAN = "ABCPE1234F"
GSTIN = "27ABCPE1234F1Z" + gstin_check_char("27ABCPE1234F1Z")
PHONE = "+91 98765 43210"


def font(size: int, bold: bool = False):
    try:
        return ImageFont.truetype(FONT_B if bold else FONT, size)
    except OSError:
        return ImageFont.load_default(size=size)


def qr_image(text: str, size: int) -> Image.Image:
    enc = cv2.QRCodeEncoder.create()
    qr = enc.encode(text)
    img = Image.fromarray(qr).convert("RGB")
    return img.resize((size, size), Image.NEAREST)


def bank_letter_txt() -> None:
    (OUT / "bank_letter.txt").write_text(f"""Dear Mr. Rahul Sharma,

This is to confirm that your savings account A/c No. 50100234567891 with IFSC HDFC0001234
at our Kothrud, Pune branch has been linked to Aadhaar {AADHAAR_1} and PAN {PAN}.

Registered mobile: {PHONE}
Email: rahul.sharma@example.com
UPI ID: rahulsharma@okhdfc
Date of birth: 14/08/1992
Address: Flat 402, Shanti Apartments, Paud Road, Kothrud, Pune - 411038

Your nominee, Mrs. Priya Sharma (wife), has been updated.

नमस्ते, मेरा नाम सुनीता पाटिल है। मेरा आधार क्रमांक {AADHAAR_2} है और मैं नाशिक में रहती हूँ।
मेरा मोबाइल नंबर 9822012345 है।

Regards,
Branch Manager
""", encoding="utf-8")


def id_card_png() -> None:
    W, H = 1000, 620
    img = Image.new("RGB", (W, H), (246, 248, 252))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 90), fill=(32, 64, 120))
    d.text((30, 25), "IDENTITY CARD  ·  SPECIMEN  ·  NOT A REAL DOCUMENT", font=font(30, True), fill="white")
    # Placeholder "photo": a simple drawn avatar (no real person).
    d.rectangle((40, 130, 260, 400), fill=(220, 226, 236), outline=(120, 130, 150), width=3)
    d.ellipse((100, 165, 200, 265), fill=(170, 150, 130))
    d.ellipse((70, 270, 230, 420), fill=(90, 110, 150))
    rows = [("Name", "Rahul Sharma"), ("DOB", "14/08/1992"), ("Gender", "Male"),
            ("Aadhaar No.", AADHAAR_1), ("Mobile", PHONE)]
    y = 140
    for k, v in rows:
        d.text((300, y), f"{k}:", font=font(30), fill=(70, 80, 100))
        d.text((500, y), v, font=font(32, True), fill=(20, 20, 30))
        y += 58
    d.text((300, y + 10), "Address: Flat 402, Paud Road, Kothrud,", font=font(26), fill=(20, 20, 30))
    d.text((300, y + 48), "Pune - 411038", font=font(26), fill=(20, 20, 30))
    img.paste(qr_image(f"name=Rahul Sharma;dob=14-08-1992;uid={AADHAAR_1.replace(' ', '')}", 160), (810, 440))
    d.text((40, 570), "SPECIMEN - generated for testing Kavach", font=font(20), fill=(200, 60, 60))
    img.save(OUT / "id_card_specimen.png")


def _code(text: str, fmt: str, scale: int) -> Image.Image:
    import zxingcpp

    b = zxingcpp.create_barcode(text, getattr(zxingcpp.BarcodeFormat, fmt))
    return Image.fromarray(np.array(zxingcpp.write_barcode_to_image(b, scale=scale))).convert("RGB")


def boarding_pass() -> None:
    """Fake boarding pass with the three code types airlines use: PDF417, Aztec, QR."""
    W, H = 1400, 560
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 80), fill=(180, 40, 50))
    d.text((30, 20), "SKYFAKE AIR  ·  BOARDING PASS  ·  SPECIMEN", font=font(34, True), fill="white")
    rows = [("Passenger", "SHARMA/RAHUL MR"), ("From", "DEL  New Delhi"), ("To", "BOM  Mumbai"),
            ("Flight", "SF 657   ·   24 OCT 2026"), ("PNR", "ABC123   ·   Seat 12A"), ("Mobile", PHONE)]
    y = 110
    for k, v in rows:
        d.text((40, y), f"{k}:", font=font(26), fill=(90, 90, 100))
        d.text((230, y), v, font=font(28, True), fill=(20, 20, 30))
        y += 50
    bcbp = "M1SHARMA/RAHUL         EABC123 DELBOMSF 0657 297Y012A0034 100"
    img.paste(_code(bcbp, "PDF417", 3), (40, 430))
    img.paste(_code(bcbp, "Aztec", 4), (1100, 110))
    img.paste(_code("https://example.com/checkin?pnr=ABC123&name=SHARMA", "QRCode", 4), (1120, 360))
    img.save(OUT / "boarding_pass.png")


def salary_slip_pdf() -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFont("Helvetica-Bold", 18)
    c.drawString(60, h - 70, "Acme Software Pvt Ltd - Salary Slip (October 2026)")
    c.setFont("Helvetica", 12)
    lines = [
        "Employee Name: Priya Deshmukh",
        "Employee ID: ACME-20417",
        f"PAN: {PAN}",
        f"Aadhaar: {AADHAAR_2}",
        "Bank A/c No: 918020034567812   IFSC: UTIB0000456",
        "UPI: priya.d@okaxis",
        f"Mobile: {PHONE}    Email: priya.deshmukh@example.com",
        "Address: B-12, Lake View Society, Baner, Pune - 411045",
        "",
        "Basic Salary ............. Rs 65,000",
        "HRA ...................... Rs 26,000",
        "Professional Tax ......... Rs 200",
        "Net Pay .................. Rs 88,450",
        "",
        f"Employer GSTIN: {GSTIN}",
    ]
    y = h - 120
    for line in lines:
        c.drawString(60, y, line)
        y -= 22
    c.showPage()
    c.save()
    data = buf.getvalue()
    (OUT / "salary_slip.pdf").write_bytes(data)
    return data


def scanned_pdf(text_pdf: bytes) -> None:
    """Render the salary slip to an image, add tilt + noise, save as image-only PDF."""
    import pypdfium2 as pdfium

    page = pdfium.PdfDocument(text_pdf)[0]
    img = page.render(scale=200 / 72).to_pil().convert("L")
    img = img.rotate(0.8, expand=True, fillcolor=255, resample=Image.BICUBIC)
    arr = np.array(img).astype(np.int16)
    arr += np.random.default_rng(1).integers(-25, 25, arr.shape, dtype=np.int16)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    img.convert("RGB").save(OUT / "salary_slip_scanned.pdf", "PDF", resolution=200)


def hr_deck_pptx() -> None:
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[0])
    s.shapes.title.text = "New Joiner Onboarding - Batch 7"
    s.placeholders[1].text = "Prepared by Neha Kulkarni, HR"

    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = "Joiner details"
    rows = [("Name", "PAN", "Mobile"),
            ("Amit Kumar Verma", "BXQPV4821K", "9876501234"),
            ("Sneha Iyer", "CKLPI7310M", "9123456780")]
    tbl = s.shapes.add_table(3, 3, Inches(0.5), Inches(1.8), Inches(9), Inches(1.5)).table
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            tbl.cell(r, c).text = val
    s.notes_slide.notes_text_frame.text = f"Call Amit on {PHONE} before Monday. His Aadhaar is {AADHAAR_1}."

    s = prs.slides.add_slide(prs.slide_layouts[5])
    s.shapes.title.text = "ID proof received"
    s.shapes.add_picture(str(OUT / "id_card_specimen.png"), Inches(1), Inches(1.6), width=Inches(8))

    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = "संपर्क"
    tf = s.placeholders[1].text_frame
    tf.text = "मेरा नाम सुनीता पाटिल है।"
    p = tf.add_paragraph()
    p.text = "Email: sunita.patil@example.com"
    p.runs[0].font.size = Pt(24)
    prs.core_properties.author = "Neha Kulkarni"
    prs.save(OUT / "hr_onboarding.pptx")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    bank_letter_txt()
    id_card_png()
    boarding_pass()
    pdf = salary_slip_pdf()
    scanned_pdf(pdf)
    hr_deck_pptx()
    print("Wrote:", *sorted(p.name for p in OUT.iterdir()))
    print("Fake Aadhaar numbers used:", AADHAAR_1, AADHAAR_2)
