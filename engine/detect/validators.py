"""Checksum validators for Indian identifiers.

A regex only says "this looks like an Aadhaar". A checksum says "this IS a
structurally valid Aadhaar", which cuts false positives such as order IDs,
timestamps and phone numbers that happen to have 12 digits.
"""

# ---------- Verhoeff (Aadhaar, VID) ----------
# Dihedral group D5 multiplication table, permutation table, inverse table.

_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def digits_only(s: str) -> str:
    return "".join(ch for ch in s if ch.isdigit())


def verhoeff_ok(number: str) -> bool:
    """True if the digits (spaces/dashes ignored) pass the Verhoeff check."""
    num = digits_only(number)
    if not num:
        return False
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def verhoeff_check_digit(partial: str) -> str:
    """Digit to append to `partial` so the result passes verhoeff_ok.

    Used by the test-data generator to make realistic fake Aadhaar numbers.
    """
    num = digits_only(partial)
    c = 0
    for i, ch in enumerate(reversed(num)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return str(_INV[c])


def aadhaar_ok(number: str) -> bool:
    """12 digits, does not start with 0 or 1, passes Verhoeff."""
    num = digits_only(number)
    return len(num) == 12 and num[0] not in "01" and verhoeff_ok(num)


def vid_ok(number: str) -> bool:
    """Aadhaar Virtual ID: 16 digits, passes Verhoeff."""
    num = digits_only(number)
    return len(num) == 16 and verhoeff_ok(num)


# ---------- Luhn (payment cards) ----------

def luhn_ok(number: str) -> bool:
    num = digits_only(number)
    if not 13 <= len(num) <= 19:
        return False
    total = 0
    for i, ch in enumerate(reversed(num)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


# ---------- PAN ----------
# AAAAA9999A — 4th letter is the holder type:
# P person, C company, H HUF, F firm, A AOP, T trust, B BOI, L local authority,
# J artificial juridical person, G government.

_PAN_HOLDER_TYPES = set("PCHFATBLJG")


def pan_ok(pan: str) -> bool:
    p = pan.strip().upper()
    return (
        len(p) == 10
        and p[:5].isalpha()
        and p[5:9].isdigit()
        and p[9].isalpha()
        and p[3] in _PAN_HOLDER_TYPES
    )


# ---------- GSTIN ----------
# 2-digit state code + PAN + entity number + 'Z' + mod-36 check character.

_GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def gstin_check_char(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14.upper()):
        product = _GST_CHARS.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return _GST_CHARS[(36 - total % 36) % 36]


def gstin_ok(gstin: str) -> bool:
    g = gstin.strip().upper()
    if len(g) != 15 or not g[:2].isdigit() or not 1 <= int(g[:2]) <= 38:
        return False
    if not pan_ok(g[2:12]) or g[13] != "Z":
        return False
    if any(ch not in _GST_CHARS for ch in g):
        return False
    return gstin_check_char(g[:14]) == g[14]


# ---------- IFSC ----------
# 4 bank letters + '0' + 6 branch characters.

def ifsc_ok(ifsc: str) -> bool:
    s = ifsc.strip().upper()
    return len(s) == 11 and s[:4].isalpha() and s[4] == "0" and s[5:].isalnum()
