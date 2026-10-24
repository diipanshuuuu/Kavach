// In-browser detection: a TypeScript port of engine/detect (rules + checksums,
// labelled fields, name cues, the user's own words, and the merge step).
//
// Used when the local engine isn't running, so IDs, numbers and contact
// details are still masked, with no network call at all.
// Keep in sync with engine/detect/{normalize,validators,rules,merge}.py.

import type { Entity, EntityType, Source } from './types';

// ---------- normalize (same length in, same length out) ----------

const DIGIT_BASES = [0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10];

export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const base = DIGIT_BASES.find((b) => c >= b && c <= b + 9);
    if (base !== undefined) out += String(c - base);
    else if (c === 0xa0 || c === 0x2007 || c === 0x202f || c === 0x2009) out += ' ';
    else out += ch;
  }
  return out;
}

// ---------- validators ----------

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const digits = (s: string) => s.replace(/\D/g, '');

function verhoeffOk(s: string): boolean {
  const n = digits(s);
  if (!n) return false;
  let c = 0;
  [...n].reverse().forEach((ch, i) => (c = D[c]![P[i % 8]![+ch]!]!));
  return c === 0;
}
const aadhaarOk = (s: string) => { const n = digits(s); return n.length === 12 && !'01'.includes(n[0]!) && verhoeffOk(n); };
const vidOk = (s: string) => digits(s).length === 16 && verhoeffOk(s);

function luhnOk(s: string): boolean {
  const n = digits(s);
  if (n.length < 13 || n.length > 19) return false;
  let total = 0;
  [...n].reverse().forEach((ch, i) => {
    let d = +ch;
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    total += d;
  });
  return total % 10 === 0;
}

const panOk = (s: string) => /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(s.trim().toUpperCase());

const GST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstinOk(s: string): boolean {
  const g = s.trim().toUpperCase();
  if (g.length !== 15 || !/^\d{2}/.test(g) || +g.slice(0, 2) < 1 || +g.slice(0, 2) > 38) return false;
  if (!panOk(g.slice(2, 12)) || g[13] !== 'Z' || [...g].some((c) => !GST.includes(c))) return false;
  let total = 0;
  [...g.slice(0, 14)].forEach((ch, i) => {
    const p = GST.indexOf(ch) * (i % 2 ? 2 : 1);
    total += Math.floor(p / 36) + (p % 36);
  });
  return GST[(36 - (total % 36)) % 36] === g[14];
}
const ifscOk = (s: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s.trim().toUpperCase());

// ---------- rules ----------

const AADHAAR_CTX = ['aadhaar', 'aadhar', 'adhaar', 'uid', 'आधार', 'ஆதார்', 'ఆధార్', 'আধার'];
const PAN_CTX = ['pan', 'permanent account', 'पैन'];
const ACCOUNT_CTX = ['a/c', 'acct', 'account', 'acc no', 'acc. no', 'savings', 'current a', 'खाता', 'खाते', 'बैंक', 'கணக்கு', 'ఖాతా'];
const PASSPORT_CTX = ['passport', 'पासपोर्ट', 'पारपत्र'];
const DOB_CTX = ['dob', 'd.o.b', 'date of birth', 'birth', 'born', 'जन्म', 'பிறந்த', 'పుట్టిన'];
const PIN_CTX = ['pin', 'pincode', 'pin code', 'postal', 'zip', 'पिन'];
const VID_CTX = ['vid', 'virtual id'];
const NOT_ID_CTX = ['order', 'tracking', 'invoice', 'txn', 'transaction', 'ref', 'awb', 'ticket', 'booking', 'pnr'];

interface Rule {
  type: EntityType;
  re: RegExp;
  score: number;
  validator?: (s: string) => boolean;
  fallback?: number;
  context?: string[];
  required?: boolean;
  window?: number;
  exclude?: string[];
}

const NA = '(?<![A-Za-z0-9])', NZ = '(?![A-Za-z0-9])', ND = '(?<!\\d)', NDZ = '(?!\\d)';
const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const r = (s: string, f = '') => new RegExp(s, 'g' + f);

const RULES: Rule[] = [
  { type: 'EMAIL', re: r('[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}'), score: 0.99 },
  { type: 'UPI', re: r('(?<![\\w.@-])[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}(?![\\w@-]|\\.[A-Za-z])'), score: 0.92 },
  { type: 'AADHAAR', re: r(ND + '[2-9]\\d{3}[ -]?\\d{4}[ -]?\\d{4}' + NDZ), score: 1, validator: aadhaarOk, fallback: 0.75, context: AADHAAR_CTX, exclude: NOT_ID_CTX },
  { type: 'VID', re: r(ND + '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}' + NDZ), score: 0.95, validator: vidOk, fallback: 0.7, context: VID_CTX, exclude: NOT_ID_CTX },
  { type: 'CARD', re: r(ND + '(?:\\d[ -]?){12,18}\\d' + NDZ), score: 0.97, validator: luhnOk, exclude: [...ACCOUNT_CTX, ...NOT_ID_CTX] },
  { type: 'GSTIN', re: r(NA + '\\d{2}[A-Za-z]{5}\\d{4}[A-Za-z][1-9A-Za-z][Zz][0-9A-Za-z]' + NZ), score: 1, validator: gstinOk, fallback: 0.85 },
  { type: 'PAN', re: r(NA + '[A-Za-z]{5}\\d{4}[A-Za-z]' + NZ), score: 1, validator: panOk, fallback: 0.7, context: PAN_CTX },
  { type: 'IFSC', re: r(NA + '[A-Z]{4}0[A-Z0-9]{6}' + NZ), score: 0.95, validator: ifscOk },
  { type: 'PHONE', re: r('(?<![\\w+])(?:(?:\\+|00)91[ -]?|0)?[6-9]\\d{4}[ -]?\\d{5}' + NDZ), score: 0.93, exclude: NOT_ID_CTX },
  { type: 'VOTER_ID', re: r(NA + '[A-Z]{3}\\d{7}' + NZ), score: 0.85 },
  { type: 'DL', re: r(NA + '[A-Z]{2}[ -]?\\d{2}[ -]?(?:19|20)\\d{2}[ -]?\\d{7}' + NZ), score: 0.9 },
  { type: 'VEHICLE', re: r(NA + '[A-Z]{2}[ -]?\\d{1,2}[ -]?[A-Z]{1,3}[ -]?\\d{4}' + NZ), score: 0.8 },
  { type: 'PASSPORT', re: r(NA + '[A-PR-WY][1-9]\\d ?\\d{4}[1-9]' + NZ), score: 0.9, context: PASSPORT_CTX, required: true },
  { type: 'BANK_ACCOUNT', re: r(ND + '\\d{9,18}' + NDZ), score: 0.9, context: ACCOUNT_CTX, required: true, window: 50 },
  { type: 'DOB', re: r(ND + '(?:0?[1-9]|[12]\\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-](?:19|20)\\d{2}' + NDZ), score: 0.9, context: DOB_CTX, required: true },
  { type: 'DOB', re: r('(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\s+' + MONTHS + ',?\\s+(?:19|20)\\d{2}', 'i'), score: 0.9, context: DOB_CTX, required: true },
  { type: 'PINCODE', re: r(ND + '[1-9]\\d{2} ?\\d{3}' + NDZ), score: 0.85, context: PIN_CTX, required: true, window: 25, exclude: NOT_ID_CTX },
];
const PIN_AFTER_PLACE = /(?:[A-Z][a-z]{2,}|[ऀ-ॿ]{3,})\s*[-–,]\s*$/;

function hasContext(text: string, start: number, words: string[] | undefined, window: number): boolean {
  if (!words?.length) return false;
  const before = text.slice(Math.max(0, start - window), start).toLowerCase();
  return words.some((w) => before.includes(w));
}

const ent = (start: number, value: string, type: EntityType, source: Source, score: number, validated = false): Entity =>
  ({ start, end: start + value.length, type, value, source, score, validated });

// ---------- labelled fields ("Name: …", "Address: …") ----------

const FIELD_LABELS: [EntityType, string][] = [
  ['PERSON', "(?:full |employee |patient |applicant |candidate |student |customer |account holder(?:'s)? |holder(?:'s)? )?name"],
  ['PERSON', "(?:father|mother|husband|wife|spouse|guardian|parent)(?:'s)?(?: name)?"],
  ['PERSON', 'nominee(?: name)?'],
  ['PERSON', '(?:passenger|traveller|traveler|guest|pax)(?: name)?'],
  ['PERSON', 'नाम|पिता का नाम|पति का नाम|माता का नाम|पालक'],
  ['ADDRESS', '(?:permanent |residential |present |correspondence |current |home |postal )?address|addr\\.?|पता|पत्ता'],
  ['OTHER', '(?:employee|emp|customer|cust|member|patient|student|consumer|policy|claim|ticket|loan|application)\\s*(?:id|no\\.?|number|code)'],
  ['OTHER', '(?:roll|enrol(?:l)?ment|registration|reg\\.?|uhid|mrn|ration card|admission)\\s*(?:no\\.?|number|id)?'],
  ['OTHER', 'pnr(?:\\s*(?:no\\.?|number))?|booking\\s*(?:ref(?:erence)?|id|no\\.?)|e-?ticket\\s*(?:no\\.?|number)?|ticket\\s*(?:no\\.?|number)|frequent flyer(?:\\s*no\\.?)?'],
];
const FIELD_RE = new RegExp(
  '(?:^|(?<=[\\s|,;(]))(?<label>' + FIELD_LABELS.map(([, p]) => `(?:${p})`).join('|') + ')' +
    '\\s*[:：\\-–]\\s*(?<value>[^\\n|]+?)(?=\\s{3,}|\\s*\\||\\n|$)',
  'gim',
);
const FIELD_TYPES = FIELD_LABELS.map(([t, p]) => [t, new RegExp(`^(?:${p})$`, 'i')] as const);
const RELATION_RE = /\b(?:[sdwc])\s*\/\s*o\.?\s+(?<value>[A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .]{1,40}?)(?=[,\n]|$|\s{2,})/gi;

function labelledFields(text: string): Entity[] {
  const out: Entity[] = [];
  for (const m of text.matchAll(FIELD_RE)) {
    const label = m.groups!.label!.trim();
    const type = FIELD_TYPES.find(([, rx]) => rx.test(label))?.[0] ?? 'OTHER';
    const raw = m.groups!.value!;
    const value = raw.replace(/[ .,;]+$/, '');
    const start = m.index! + m[0].length - raw.length;
    if (value.trim().length < 2) continue;
    if (type === 'PERSON' && (/\d/.test(value) || value.split(/\s+/).length > 6)) continue;
    out.push(ent(start, value, type, 'rule', 0.88));
  }
  for (const m of text.matchAll(RELATION_RE)) {
    const v = m.groups!.value!;
    out.push(ent(m.index! + m[0].length - v.length, v, 'PERSON', 'rule', 0.88));
  }
  return out;
}

// ---------- names after cues ("Dear Rahul Sharma", "मेरा नाम … है") ----------

const NOT_NAMES = new Set(['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Shri', 'Smt', 'Sri', 'Prof', 'Kumari', 'Sir', 'Madam', 'Team',
  'Customer', 'User', 'Patient', 'Applicant', 'All', 'Friend', 'Here', 'Sure', 'Not', 'Very', 'Sorry', 'Happy', 'Good',
  'Fine', 'Glad', 'Writing', 'Looking']);
const CAP_NAME = '[A-Z][a-z]+(?:[ -][A-Z][a-z]+){0,3}';
const HONORIFIC_RE = new RegExp('\\b(?:Dear(?:\\s+(?:Mr|Mrs|Ms|Miss|Dr|Shri|Smt|Sri|Prof)\\.?)?|Mr\\.?|Mrs\\.?|Ms\\.?|Miss|Dr\\.?|Shri\\.?|Smt\\.?|Sri\\.?|Kumari|Prof\\.?)\\s+(?<value>' + CAP_NAME + ')', 'g');
// The cue is case-insensitive but the name must be capitalised, so match loosely and trim.
const CUE_RE = /\b(?:billed to|bill to|attn\.?:?|attention:?|signed by|treated by|referred by|i am|i'm|my name is|this is)\s+(?:dr\.?\s+)?(?<value>[A-Za-z]+(?:[ -][A-Za-z]+){0,3})/gi;
const HINDI_NAME_RE = /(?:मेरा नाम|मेरे नाव|माझे नाव|नाम)\s+(?<value>[ऀ-ॿ]+(?:\s[ऀ-ॿ]+){0,2}?)\s+(?:है|आहे|हूँ|हूं)/g;

function contextNames(text: string): Entity[] {
  const out: Entity[] = [];
  const add = (start: number, value: string) => {
    if (value && !NOT_NAMES.has(value.split(/\s+/)[0]!)) out.push(ent(start, value, 'PERSON', 'rule', 0.85));
  };
  for (const m of text.matchAll(HONORIFIC_RE)) add(m.index! + m[0].length - m.groups!.value!.length, m.groups!.value!);
  for (const m of text.matchAll(CUE_RE)) {
    const raw = m.groups!.value!;
    const words = raw.split(/(?=[ -])/);
    let value = '';
    for (const w of words) {
      const clean = w.replace(/^[ -]/, '');
      if (!/^[A-Z][a-z]+$/.test(clean)) break;
      value += w;
    }
    add(m.index! + m[0].length - raw.length, value);
  }
  for (const m of text.matchAll(HINDI_NAME_RE)) add(m.index! + m[0].indexOf(m.groups!.value!), m.groups!.value!);
  return out;
}

// ---------- the user's own words ----------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);
const TERM_GAP = '[\\s\\-–—·.,/:|]*';
const LETTER_DIGIT = /(?<=\p{N})(?=\p{L})|(?<=\p{L})(?=\p{N})/u;

export function findTerms(text: string, terms: string[]): Entity[] {
  const out: Entity[] = [];
  for (const term of new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))) {
    // Same as the engine: words, and letters/digits inside a word, may be joined by spaces, punctuation or nothing.
    const pieces = term.split(/\s+/).flatMap((w) => w.split(LETTER_DIGIT)).filter((p) => /[\p{L}\p{N}]/u.test(p));
    if (!pieces.length) continue;
    const body = pieces.map(escape).join(TERM_GAP);
    const left = isWordChar(term[0]!) ? '(?<![\\p{L}\\p{N}\\p{M}])' : '';
    const right = isWordChar(term.at(-1)!) ? '(?![\\p{L}\\p{N}\\p{M}])' : '';
    for (const m of text.matchAll(new RegExp(left + body + right, 'giu'))) out.push(ent(m.index!, m[0], 'CUSTOM', 'user', 1));
  }
  return out;
}

// ---------- merge ----------

const ALLOWLIST = new Set(['india', 'bharat', 'government of india', 'govt of india', 'government', 'reserve bank of india',
  'rbi', 'uidai', 'income tax department', 'income tax', 'sbi', 'state bank of india', 'hdfc bank', 'icici bank', 'axis bank',
  'bank', 'aadhaar', 'pan', 'gst', 'upi', 'chatgpt', 'gemini', 'claude', 'भारत सरकार', 'भारत', 'आधार']);
const PRIORITY: Record<Source, number> = { user: 6, rule: 3, vision: 3, ner: 2, llm: 1 };

const rank = (e: Entity): [number, number, number] => [
  e.type === 'ADDRESS' ? 4 : PRIORITY[e.source] + (e.validated ? 1 : 0),
  e.end - e.start,
  e.score,
];
const overlaps = (a: Entity, b: Entity) => a.start < b.end && b.start < a.end;

export function merge(entities: Entity[], text: string): Entity[] {
  const cands = entities.filter((e) => e.end > e.start && (e.source === 'user' || !ALLOWLIST.has(e.value.trim().toLowerCase())));
  const auto = cands.filter((e) => e.source !== 'user').sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2];
  });
  let taken: Entity[] = [];
  for (const e of auto) if (!taken.some((t) => overlaps(t, e))) taken.push(e);
  // The user's words win, unless something larger already hides them.
  for (const u of cands.filter((e) => e.source === 'user').sort((a, b) => b.end - b.start - (a.end - a.start))) {
    if (taken.some((t) => t.start <= u.start && u.end <= t.end)) continue;
    taken = taken.filter((t) => !overlaps(t, u)).concat(u);
  }
  return taken.map((e) => ({ ...e, value: text.slice(e.start, e.end) })).sort((a, b) => a.start - b.start);
}

// ---------- entry point ----------

export function detectLocal(text: string, terms: string[] = []): Entity[] {
  const norm = normalize(text);
  const found: Entity[] = [];
  for (const rule of RULES) {
    for (const m of norm.matchAll(rule.re)) {
      const s = m.index!;
      const value = m[0];
      if (hasContext(norm, s, rule.exclude, 25)) continue;
      let ctx = hasContext(norm, s, rule.context, rule.window ?? 40);
      if (rule.type === 'PINCODE' && !ctx) ctx = PIN_AFTER_PLACE.test(norm.slice(Math.max(0, s - 30), s));
      if (rule.required && !ctx) continue;
      let score = rule.score, validated = false;
      if (rule.validator) {
        if (rule.validator(value)) validated = true;
        else if (rule.fallback !== undefined && ctx) score = rule.fallback;
        else continue;
      } else if (ctx) score = Math.min(1, Math.round((score + 0.05) * 1000) / 1000);
      found.push(ent(s, value, rule.type, 'rule', score, validated));
    }
  }
  found.push(...labelledFields(norm), ...contextNames(norm), ...findTerms(norm, terms));
  return merge(found, text);
}
