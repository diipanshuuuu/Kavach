"""Measure detection quality on synthetic Indian documents with known answers.

    python eval/evaluate.py              # rules vs rules+NER
    python eval/evaluate.py --llm 25     # also rules+NER+Qwen3 on 25 docs (slow)

Every document is generated with the exact position of every sensitive value,
plus decoys that must NOT be flagged (order IDs that fail the Aadhaar
checksum, invoice numbers, timestamps, amounts).
"""

import argparse
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from faker import Faker  # noqa: E402

from detect import llm, ner, rules  # noqa: E402
from detect.merge import merge  # noqa: E402
from detect.normalize import normalize  # noqa: E402
from detect.validators import gstin_check_char, verhoeff_check_digit, verhoeff_ok  # noqa: E402

# Predictions of these types count for these gold types.
GROUP = {
    "PERSON": "PERSON",
    "ADDRESS": "ADDRESS", "LOCATION": "ADDRESS", "PINCODE": "ADDRESS",
}

fake_en = Faker("en_IN")
fake_hi = Faker("hi_IN")


def rnd_digits(n: int) -> str:
    return "".join(random.choice("0123456789") for _ in range(n))


def aadhaar() -> str:
    b = str(random.randint(2, 9)) + rnd_digits(10)
    n = b + verhoeff_check_digit(b)
    return random.choice([f"{n[:4]} {n[4:8]} {n[8:]}", n, f"{n[:4]}-{n[4:8]}-{n[8:]}"])


def bad_12_digits() -> str:
    while True:
        n = str(random.randint(2, 9)) + rnd_digits(11)
        if not verhoeff_ok(n):
            return n


def pan() -> str:
    L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return "".join(random.choice(L) for _ in range(3)) + "P" + random.choice(L) + rnd_digits(4) + random.choice(L)


def gstin() -> str:
    g = f"{random.randint(1, 37):02d}" + pan() + str(random.randint(1, 9)) + "Z"
    return g + gstin_check_char(g)


def card() -> str:
    while True:
        n = "4" + rnd_digits(15)
        total = 0
        for i, ch in enumerate(reversed(n)):
            d = int(ch) * (2 if i % 2 else 1)
            total += d - 9 if d > 9 else d
        if total % 10 == 0:
            return " ".join(n[i:i + 4] for i in range(0, 16, 4))


def phone() -> str:
    n = random.choice("6789") + rnd_digits(9)
    return random.choice([n, f"+91 {n[:5]} {n[5:]}", f"+91-{n}", f"0{n}"])


def ifsc() -> str:
    return random.choice(["SBIN", "HDFC", "ICIC", "UTIB", "PUNB", "KKBK"]) + "0" + rnd_digits(6)


def name(hindi: bool) -> str:
    return fake_hi.name() if hindi else fake_en.name()


def address() -> str:
    return f"{random.randint(1, 999)}, {fake_en.street_name()}, {fake_en.city()} - {random.randint(110001, 855999)}"


class Doc:
    def __init__(self) -> None:
        self.text = ""
        self.gold: list[tuple[int, int, str]] = []

    def t(self, s: str) -> "Doc":
        self.text += s
        return self

    def v(self, value: str, etype: str) -> "Doc":
        self.gold.append((len(self.text), len(self.text) + len(value), etype))
        self.text += value
        return self


def make_doc() -> Doc:
    d = Doc()
    hindi = random.random() < 0.25
    kind = random.choice(["bank", "salary", "kyc", "chat", "medical", "invoice", "prose", "prose"])
    if kind == "prose":
        # Names in plain sentences with no "Dear"/"Name:" cue: only NER / the LLM can find these.
        if hindi:
            d.v(name(True), "PERSON").t(" और ").v(name(True), "PERSON").t(" कल ").v(fake_en.city(), "ADDRESS").t(" गए थे। ")
            d.v(name(True), "PERSON").t(" ने रिपोर्ट भेजी।\n")
        else:
            d.t("Meeting notes: ").v(name(False), "PERSON").t(" and ").v(name(False), "PERSON")
            d.t(" agreed to ship the release on Friday. ").v(name(False), "PERSON")
            d.t(" will share the budget with the finance team in ").v(fake_en.city(), "ADDRESS").t(".\n")
            d.t("Please forward the contract to ").v(name(False), "PERSON").t(" before the review.\n")
        return d
    if kind == "bank":
        d.t("Dear ").v(name(False), "PERSON").t(",\nYour savings A/c No. ").v(rnd_digits(random.randint(11, 16)), "BANK_ACCOUNT")
        d.t(" with IFSC ").v(ifsc(), "IFSC").t(" is now linked to Aadhaar ").v(aadhaar(), "AADHAAR").t(".\n")
        d.t("Registered mobile: ").v(phone(), "PHONE").t("\nUPI: ").v(fake_en.user_name() + "@ok" + random.choice(["axis", "hdfc", "sbi"]), "UPI")
        d.t(f"\nReference: TXN{rnd_digits(10)} dated 12/0{random.randint(1, 9)}/2026.\n")
    elif kind == "salary":
        d.t("Salary slip for October 2026\nEmployee Name: ").v(name(False), "PERSON").t("\nPAN: ").v(pan(), "PAN")
        d.t("\nBank A/c No: ").v(rnd_digits(14), "BANK_ACCOUNT").t("   IFSC: ").v(ifsc(), "IFSC")
        d.t(f"\nNet Pay: Rs {random.randint(20, 150)},{rnd_digits(3)}\nEmployer GSTIN: ").v(gstin(), "GSTIN").t("\n")
    elif kind == "kyc":
        d.t("KYC form\nName: ").v(name(False), "PERSON").t("\nFather's Name: ").v(name(False), "PERSON")
        d.t("\nDate of Birth: ").v(f"{random.randint(1, 28):02d}/{random.randint(1, 12):02d}/{random.randint(1960, 2005)}", "DOB")
        d.t("\nAddress: ").v(address(), "ADDRESS").t("\nEmail: ").v(fake_en.email(), "EMAIL").t("\nAadhaar No: ").v(aadhaar(), "AADHAAR").t("\n")
    elif kind == "chat":
        if hindi:
            d.t("नमस्ते, मेरा नाम ").v(name(True), "PERSON").t(" है। मेरा आधार नंबर ").v(aadhaar(), "AADHAAR")
            d.t(" है और मोबाइल ").v(phone(), "PHONE").t(" है। कृपया मदद करें।\n")
        else:
            d.t("Hi, I'm ").v(name(False), "PERSON").t(". Can you help me write a complaint? My card ").v(card(), "CARD")
            d.t(" was charged twice. You can reach me at ").v(fake_en.email(), "EMAIL").t(" or ").v(phone(), "PHONE").t(".\n")
    elif kind == "medical":
        d.t("Discharge summary\nPatient Name: ").v(name(False), "PERSON").t("\nDOB: ")
        d.t("").v(f"{random.randint(1, 28):02d}-{random.randint(1, 12):02d}-{random.randint(1950, 2010)}", "DOB")
        d.t("\nContact: ").v(phone(), "PHONE").t("\nAddress: ").v(address(), "ADDRESS").t("\nTreated by Dr. ").v(name(False), "PERSON").t(".\n")
    else:
        d.t(f"Invoice INV-{rnd_digits(6)}\nOrder ID {bad_12_digits()} placed at 14:32 on 03/10/2026.\n")
        d.t("Billed to ").v(name(False), "PERSON").t(", GSTIN ").v(gstin(), "GSTIN")
        d.t(f"\nAmount: Rs {random.randint(1000, 99999)}. Tracking number {rnd_digits(12)}.\n")
    return d


def evaluate(docs: list[Doc], use_ner: bool, use_llm: bool) -> dict:
    tp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)
    fp = 0
    n_pred = 0
    started = time.time()
    for d in docs:
        norm = normalize(d.text)
        found = rules.find(norm)
        if use_ner:
            found += ner.find(norm)
        if use_llm:
            found += llm.find(norm)
        preds = merge(found, d.text)
        n_pred += len(preds)
        hit_pred = set()
        for gs, ge, gt in d.gold:
            group = GROUP.get(gt, gt)
            hit = False
            for k, p in enumerate(preds):
                if p.start < ge and gs < p.end and GROUP.get(p.type, p.type) == group:
                    hit = True
                    hit_pred.add(k)
            (tp if hit else fn)[gt] += 1
        for k, p in enumerate(preds):
            if k in hit_pred:
                continue
            # A prediction overlapping gold of another type still hides real data; not a false alarm.
            if not any(p.start < ge and gs < p.end for gs, ge, _ in d.gold):
                fp += 1
    total_tp, total_fn = sum(tp.values()), sum(fn.values())
    return {
        "recall": total_tp / max(1, total_tp + total_fn),
        "precision": (n_pred - fp) / max(1, n_pred),
        "per_type": {t: tp[t] / max(1, tp[t] + fn[t]) for t in sorted(set(tp) | set(fn))},
        "false_alarms": fp,
        "ms_per_doc": (time.time() - started) * 1000 / max(1, len(docs)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", type=int, default=150)
    ap.add_argument("--llm", type=int, default=0, help="also evaluate deep scan on this many docs")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    Faker.seed(args.seed)
    docs = [make_doc() for _ in range(args.docs)]
    ner.load()
    ner.find("warm up")

    configs = [("Rules + checksums", docs, False, False), ("Rules + NER", docs, True, False)]
    if args.llm and llm.available():
        sub = docs[: args.llm]
        configs += [("Rules + NER (same subset)", sub, True, False), ("Rules + NER + Qwen3", sub, True, True)]

    results = [(label, len(ds), evaluate(ds, n, l)) for label, ds, n, l in configs]

    print(f"\nKavach detection eval · {args.docs} synthetic docs · NER model: {ner.model_name()}\n")
    print(f"| Setup | Docs | Recall | Precision | False alarms | ms/doc |\n|---|---|---|---|---|---|")
    for label, n, r in results:
        print(f"| {label} | {n} | {r['recall']:.1%} | {r['precision']:.1%} | {r['false_alarms']} | {r['ms_per_doc']:.0f} |")
    types = sorted({t for _, _, r in results for t in r["per_type"]})
    print("\nRecall per type:\n")
    print("| Type | " + " | ".join(label for label, _, _ in results) + " |")
    print("|---|" + "---|" * len(results))
    for t in types:
        print(f"| {t} | " + " | ".join(f"{r['per_type'].get(t, 0):.0%}" for _, _, r in results) + " |")


if __name__ == "__main__":
    main()
