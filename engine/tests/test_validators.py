import random

from detect.validators import (
    aadhaar_ok,
    gstin_check_char,
    gstin_ok,
    ifsc_ok,
    luhn_ok,
    pan_ok,
    verhoeff_check_digit,
    verhoeff_ok,
)


def test_verhoeff_reference_example():
    assert verhoeff_check_digit("236") == "3"
    assert verhoeff_ok("2363")
    assert not verhoeff_ok("2364")


def test_aadhaar_round_trip_and_single_digit_errors():
    random.seed(0)
    for _ in range(500):
        base = str(random.randint(2, 9)) + "".join(random.choice("0123456789") for _ in range(10))
        n = base + verhoeff_check_digit(base)
        assert aadhaar_ok(n)
        assert aadhaar_ok(f"{n[:4]} {n[4:8]} {n[8:]}")
        wrong = n[:-1] + str((int(n[-1]) + 1) % 10)
        assert not aadhaar_ok(wrong)


def test_aadhaar_cannot_start_with_0_or_1():
    base = "1" + "2345678901"
    assert not aadhaar_ok(base + verhoeff_check_digit(base))


def test_luhn():
    assert luhn_ok("4111 1111 1111 1111")
    assert not luhn_ok("4111 1111 1111 1112")
    assert not luhn_ok("1234")


def test_pan_holder_type():
    assert pan_ok("ABCPE1234F")
    assert pan_ok("abcpe1234f")
    assert not pan_ok("ABCXE1234F")  # X is not a holder type
    assert not pan_ok("ABCPE12345")


def test_gstin_checksum():
    g = "27ABCPE1234F1Z"
    full = g + gstin_check_char(g)
    assert gstin_ok(full)
    assert not gstin_ok(g + ("A" if full[-1] != "A" else "B"))


def test_ifsc():
    assert ifsc_ok("SBIN0001234")
    assert not ifsc_ok("SBIN1001234")
