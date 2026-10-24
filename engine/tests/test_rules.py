from detect import rules
from detect.merge import merge
from detect.normalize import normalize
from detect.validators import verhoeff_check_digit

AADHAAR = "726018159082"
assert verhoeff_check_digit(AADHAAR[:-1]) == AADHAAR[-1]


def found(text: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for e in merge(rules.find(normalize(text)), text):
        out.setdefault(e.type, []).append(e.value)
    return out


def test_core_identifiers():
    f = found(
        f"Aadhaar {AADHAAR[:4]} {AADHAAR[4:8]} {AADHAAR[8:]}, PAN ABCPE1234F, IFSC SBIN0001234, "
        "GSTIN 27ABCPE1234F1ZB, card 4111 1111 1111 1111, mail a.b@example.com, UPI ab@okaxis."
    )
    assert f["AADHAAR"] == ["7260 1815 9082"]
    assert f["PAN"] == ["ABCPE1234F"]
    assert f["IFSC"] == ["SBIN0001234"]
    assert f["GSTIN"] == ["27ABCPE1234F1ZB"]
    assert f["CARD"] == ["4111 1111 1111 1111"]
    assert f["EMAIL"] == ["a.b@example.com"]
    assert f["UPI"] == ["ab@okaxis"]


def test_devanagari_digits():
    hindi = "".join("०१२३४५६७८९"[int(c)] for c in AADHAAR)
    assert found(f"आधार क्रमांक: {hindi}")["AADHAAR"] == [hindi]


def test_phone_formats():
    for p in ["9876543210", "+91 98765 43210", "+91-9876543210", "09876543210"]:
        assert found(f"Call me on {p} today")["PHONE"] == [p]


def test_context_required():
    assert "BANK_ACCOUNT" in found("A/c No. 50100234567891")
    assert "BANK_ACCOUNT" not in found("The value was 50100234567891")
    assert "DOB" in found("Date of birth: 14/08/1992")
    assert "DOB" not in found("Meeting on 14/08/2026")
    assert "PASSPORT" in found("Passport No. K1234567")


def test_decoys_are_ignored():
    # 12 digits that fail the Aadhaar checksum, an order number, a timestamp.
    f = found("Order ID 123456789012 placed at 14:32 on 03/10/2026. Invoice INV-255341. TXN8324210249.")
    assert f == {}


def test_labelled_fields_and_names():
    f = found("Name: Rahul Sharma\nFather's Name: Suresh Sharma\nAddress: 12, MG Road, Pune - 411001\nDear Mr. Amit Verma,")
    assert set(f["PERSON"]) == {"Rahul Sharma", "Suresh Sharma", "Amit Verma"}
    assert f["ADDRESS"] == ["12, MG Road, Pune - 411001"]


def test_hindi_name_context():
    assert found("मेरा नाम सुनीता पाटिल है")["PERSON"] == ["सुनीता पाटिल"]
