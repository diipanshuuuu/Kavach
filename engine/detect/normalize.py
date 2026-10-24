"""Text normalization that never changes character offsets.

Indian documents often write numbers in native scripts (e.g. Devanagari
१२३४). We map every native-script digit to its ASCII digit, one character
for one character, so regexes work and every offset still points into the
original text.
"""

# First code point of the 0-9 run for each script.
_DIGIT_BLOCKS = {
    "devanagari": 0x0966,
    "bengali": 0x09E6,
    "gurmukhi": 0x0A66,
    "gujarati": 0x0AE6,
    "odia": 0x0B66,
    "tamil": 0x0BE6,
    "telugu": 0x0C66,
    "kannada": 0x0CE6,
    "malayalam": 0x0D66,
    "fullwidth": 0xFF10,
}

_TABLE = {
    base + i: ord("0") + i
    for base in _DIGIT_BLOCKS.values()
    for i in range(10)
}
# Non-breaking and other odd spaces -> plain space (same length).
_TABLE.update({0x00A0: 0x20, 0x2007: 0x20, 0x202F: 0x20, 0x2009: 0x20})


def normalize(text: str) -> str:
    out = text.translate(_TABLE)
    assert len(out) == len(text)
    return out
