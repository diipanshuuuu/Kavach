// Kavach on-page UI: review cards, loading/error cards and toasts.
// Everything lives in one Shadow DOM so the chatbot's CSS can't touch it
// and ours can't break the site.

import { colorOf, labelOf, sourceLabel } from '@/lib/colors';
import { findTerms } from '@/lib/local-detect';
import { addCustomTerm } from '@/lib/settings';
import type { AnalyzeFileResponse, Entity } from '@/lib/types';
import { CSS } from './styles';

let host: HTMLElement | null = null;
let root: ShadowRoot;

function ensureRoot(): ShadowRoot {
  if (host?.isConnected) return root;
  host = document.createElement('kavach-root');
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; inset: 0; pointer-events: none;';
  // Closed: the chatbot's own scripts can't read the review card (it shows the
  // original text). Automated tests build with VITE_KAVACH_OPEN_SHADOW=1.
  root = host.attachShadow({ mode: import.meta.env.VITE_KAVACH_OPEN_SHADOW === '1' ? 'open' : 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);
  // Keys typed in our UI must not reach the chatbot (Enter would send the message).
  for (const ev of ['keydown', 'keyup', 'keypress', 'paste', 'input']) {
    host.addEventListener(ev, (e) => e.stopPropagation());
  }
  document.documentElement.append(host);
  return root;
}

export const isKavachNode = (n: Node | null) => !!n && !!host && (n === host || host.contains(n));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const SHIELD = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z"/></svg>`;

const SHIELD_SM = SHIELD.replace(/width="22" height="22"/, 'width="16" height="16"');

interface Shell {
  overlay: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
  /** What the ✕ button does (defaults to closing). */
  onDismiss: (fn: () => void) => void;
}

/** Card frame: gradient header with title, trust badge and ✕, then body and footer. */
function shell(title: string, subtitle: string, badge: 'local' | 'offline' | null = 'local'): Shell {
  const r = ensureRoot();
  const overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', title);
  const head = el('div', 'head');
  const logo = el('div', 'logo');
  logo.innerHTML = SHIELD;
  const titles = el('div', 'titles');
  titles.append(el('div', 'title', title), el('div', 'subtitle', subtitle));
  head.append(logo, titles);
  if (badge) {
    const b = el('span', `badge${badge === 'offline' ? ' offline' : ''}`);
    b.append(el('span', 'dot'), document.createTextNode(badge === 'offline' ? 'In-browser check' : 'On this device'));
    b.title = badge === 'offline' ? 'Local engine offline: checked with in-browser rules' : 'Checked by the Kavach engine on this laptop. Nothing was sent anywhere.';
    head.append(b);
  }
  const close = () => overlay.remove();
  let dismiss = close;
  const x = el('button', 'x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => dismiss());
  head.append(x);
  const body = el('div', 'body');
  const footer = el('div', 'footer');
  card.append(head, body, footer);
  overlay.append(card);
  r.append(overlay);
  return { overlay, body, footer, close, onDismiss: (fn) => (dismiss = fn) };
}

function button(label: string, kind: 'primary' | 'ghost' | 'danger', onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${kind}`);
  b.type = 'button';
  setLabel(b, label);
  b.addEventListener('click', onClick);
  return b;
}

/** Set a button's text; primary buttons get the shield icon. */
function setLabel(b: HTMLButtonElement, label: string): void {
  const icon = el('span');
  icon.style.display = 'grid';
  if (b.classList.contains('primary')) icon.innerHTML = SHIELD_SM;
  b.replaceChildren(...(icon.innerHTML ? [icon] : []), document.createTextNode(label));
}

function keyHints(enterLabel: string): HTMLElement {
  const k = el('span', 'keys');
  k.append(el('kbd', '', '↵'), document.createTextNode(` ${enterLabel}  `), el('kbd', '', 'Esc'), document.createTextNode(' cancel'));
  return k;
}

function legend(types: string[]): HTMLElement {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const wrap = el('div', 'legend');
  for (const [t, n] of counts) {
    const chip = el('span', 'chip', `${n} × ${labelOf(t as Entity['type'])}`);
    chip.style.setProperty('--c', colorOf(t as Entity['type']));
    wrap.append(chip);
  }
  return wrap;
}

function onKeys(overlay: HTMLElement, enter: () => void, esc: () => void) {
  overlay.tabIndex = -1;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') esc();
    else if (e.key === 'Enter' && !(e.target as HTMLElement).matches('button, input')) enter();
  });
}

/** "Hide text…" box: type a word or phrase, optionally remember it. */
function hideInput(placeholder: string, onAdd: (term: string, remember: boolean) => void): HTMLElement {
  const row = el('div', 'hide-row');
  const input = el('input', 'hide-input');
  input.type = 'text';
  input.placeholder = placeholder;
  const remember = el('input');
  remember.type = 'checkbox';
  const rememberLabel = el('label', 'remember');
  rememberLabel.append(remember, document.createTextNode(' Always hide'));
  const add = () => {
    const term = input.value.trim();
    if (term.length < 2) return;
    onAdd(term, remember.checked);
    if (remember.checked) addCustomTerm(term);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });
  row.append(input, button('Hide', 'ghost', add), rememberLabel);
  return row;
}

/** When the local engine is offline, say what was (and wasn't) checked. */
function modeNotes(mode: 'engine' | 'browser' | undefined): HTMLElement[] {
  if (mode !== 'browser') return [];
  return [
    el(
      'div',
      'notice',
      "Local engine is offline. Checked with Kavach's in-browser rules (IDs, numbers, form fields). Names in plain sentences may be missed: click any word to hide it.",
    ),
  ];
}

// ---------- text review ----------

export type TextChoice =
  | { action: 'protect'; entities: Entity[] }
  | { action: 'original' }
  | { action: 'cancel' }
  | { action: 'deep' };

export interface TextOpts {
  deepDone: boolean;
  timing?: string;
  mode?: 'engine' | 'browser';
}

export function reviewText(text: string, entities: Entity[], opts: TextOpts): Promise<TextChoice> {
  return new Promise((resolve) => {
    const n = entities.length;
    const s = shell(
      n ? `Kavach found ${n} sensitive item${n === 1 ? '' : 's'}` : 'Kavach found nothing automatically',
      'Click a highlight to keep it visible. Click any other word to hide it.',
      opts.mode === 'browser' ? 'offline' : 'local',
    );
    const on = entities.map(() => true);
    let manual: [number, number][] = []; // spans the user chose to hide
    let view: 'review' | 'sent' = 'review';

    const inManual = (a: number, b: number) => manual.findIndex(([s0, e0]) => a < e0 && s0 < b);
    const overlapsAuto = (a: number, b: number) => entities.some((e, i) => on[i] && a < e.end && e.start < b);

    s.body.append(...modeNotes(opts.mode));
    const legendSlot = el('div');
    s.body.append(legendSlot);

    // Two views of the same text: what you'll hide, and exactly what the chatbot receives.
    const tabs = el('div', 'tabs');
    const tabReview = el('button', 'tab on', 'Review');
    const tabSent = el('button', 'tab', 'What the chatbot gets');
    for (const [t, v] of [[tabReview, 'review'], [tabSent, 'sent']] as const) {
      t.type = 'button';
      t.addEventListener('click', () => {
        view = v;
        tabReview.classList.toggle('on', v === 'review');
        tabSent.classList.toggle('on', v === 'sent');
        draw();
      });
    }
    tabs.append(tabReview, tabSent);
    s.body.append(tabs);
    const preview = el('div', 'preview');
    s.body.append(preview);
    const sentNote = el('p', 'note', 'Exactly this goes to the chatbot. The real values stay on this device.');
    sentNote.hidden = true;
    s.body.append(sentNote);
    s.body.append(
      hideInput('Hide a word or phrase everywhere in this text…', (term) => {
        for (const e of findTerms(text, [term])) {
          if (!overlapsAuto(e.start, e.end) && inManual(e.start, e.end) < 0) manual.push([e.start, e.end]);
        }
        draw();
      }),
    );
    if (opts.timing) s.body.append(el('div', 'meta', opts.timing));

    const wordSpan = (a: number, b: number) => {
      const w = el('span', 'w', text.slice(a, b));
      if (inManual(a, b) >= 0) w.classList.add('hid');
      w.addEventListener('click', () => {
        const k = inManual(a, b);
        if (k >= 0) manual.splice(k, 1);
        else manual.push([a, b]);
        draw();
      });
      return w;
    };

    function plain(from: number, to: number) {
      const chunk = text.slice(from, to);
      for (const m of chunk.matchAll(/\S+|\s+/g)) {
        const a = from + m.index!;
        const b = a + m[0].length;
        preview.append(/\S/.test(m[0]) ? wordSpan(a, b) : document.createTextNode(m[0]));
      }
    }

    /** The masked text as the chatbot will see it (labels numbered like the vault does). */
    function drawSent() {
      const counters: Record<string, number> = {};
      const seen = new Map<string, string>();
      let pos = 0;
      for (const e of chosen()) {
        if (e.start > pos) preview.append(document.createTextNode(text.slice(pos, e.start)));
        const key = `${e.type}|${e.value.trim().toLowerCase()}`;
        if (!seen.has(key)) seen.set(key, `[${e.type}_${(counters[e.type] = (counters[e.type] ?? 0) + 1)}]`);
        const tok = el('span', 'tok', seen.get(key)!);
        tok.style.setProperty('--c', colorOf(e.type));
        preview.append(tok);
        pos = e.end;
      }
      if (pos < text.length) preview.append(document.createTextNode(text.slice(pos)));
    }

    function draw() {
      const scroll = preview.scrollTop;
      preview.replaceChildren();
      sentNote.hidden = view !== 'sent';
      legendSlot.replaceChildren(
        legend([...entities.filter((_, i) => on[i]).map((e) => e.type), ...groups().map(() => 'CUSTOM')]),
      );
      update();
      if (view === 'sent') return drawSent();
      let pos = 0;
      entities.forEach((e, i) => {
        if (e.start > pos) plain(pos, e.start);
        const m = el('mark', 'hl', text.slice(e.start, e.end));
        m.style.setProperty('--c', colorOf(e.type));
        m.dataset.label = labelOf(e.type);
        m.title = `${labelOf(e.type)} · ${sourceLabel(e.source, e.score, e.validated)} — click to toggle`;
        if (!on[i]) m.classList.add('off');
        m.addEventListener('click', () => {
          on[i] = !on[i];
          draw();
        });
        preview.append(m);
        pos = e.end;
      });
      if (pos < text.length) plain(pos, text.length);
      preview.scrollTop = scroll;
    }

    /** Manual spans merged into phrases (neighbouring words become one placeholder). */
    function groups(): [number, number][] {
      const sorted = [...manual].sort((a, b) => a[0] - b[0]);
      const out: [number, number][] = [];
      for (const [a, b] of sorted) {
        const last = out.at(-1);
        if (last && /^\s*$/.test(text.slice(last[1], a)) && !text.slice(last[1], a).includes('\n')) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
      }
      return out.filter(([a, b]) => !overlapsAuto(a, b));
    }

    const finish = (c: TextChoice) => {
      s.close();
      resolve(c);
    };
    const chosen = (): Entity[] => [
      ...entities.filter((_, i) => on[i]),
      ...groups().map(([a, b]): Entity => ({ start: a, end: b, type: 'CUSTOM', value: text.slice(a, b), source: 'user', score: 1 })),
    ].sort((a, b) => a.start - b.start);

    const protect = button('', 'primary', () => finish({ action: 'protect', entities: chosen() }));
    function update() {
      const k = chosen().length;
      setLabel(protect, k ? `Protect ${k} & paste` : 'Paste without masking');
    }

    const left = el('div', 'left');
    if (!opts.deepDone && opts.mode !== 'browser') {
      const deep = button('Deep scan (Qwen3)', 'ghost', () => finish({ action: 'deep' }));
      deep.title = 'Also look for addresses, relatives, medical details with a local LLM';
      left.append(deep);
    }
    left.append(keyHints('protect'));
    s.onDismiss(() => finish({ action: 'cancel' }));
    s.footer.append(
      left,
      button('Cancel', 'ghost', () => finish({ action: 'cancel' })),
      button('Paste original', 'danger', () => finish({ action: 'original' })),
      protect,
    );
    draw();
    onKeys(s.overlay, () => protect.click(), () => finish({ action: 'cancel' }));
    protect.focus();
  });
}

// ---------- file review ----------

export type FileChoice =
  | { action: 'protect'; chosen: string[]; customBoxes: Record<string, number[][]>; terms: string[] }
  | { action: 'original' }
  | { action: 'cancel' };

export function reviewFile(r: AnalyzeFileResponse): Promise<FileChoice> {
  return new Promise((resolve) => {
    const items = r.pages.flatMap((p) => p.items);
    const n = items.length;
    const s = shell(
      n ? `${r.filename}: ${n} sensitive item${n === 1 ? '' : 's'}` : `${r.filename}: nothing found automatically`,
      'Click a box or row to keep it visible. Drag on a page to hide anything else.',
    );
    const on = new Map(items.map((i) => [i.id, true]));
    const toggles = new Map<string, HTMLElement[]>();
    const boxes: Record<string, number[][]> = {}; // page index -> boxes drawn by the user
    const terms: string[] = [];

    const reg = (id: string, node: HTMLElement) => toggles.set(id, [...(toggles.get(id) ?? []), node]);
    const flip = (id: string) => {
      on.set(id, !on.get(id));
      for (const node of toggles.get(id) ?? []) node.classList.toggle('off', !on.get(id));
      const cb = s.body.querySelector<HTMLInputElement>(`input[data-id="${CSS_ESCAPE(id)}"]`);
      if (cb) cb.checked = !!on.get(id);
      update();
    };

    if (n) s.body.append(legend(items.map((i) => i.type)));

    const chips = el('div', 'legend');
    s.body.append(
      hideInput('Hide a word everywhere in this file…', (term) => {
        if (terms.some((t) => t.toLowerCase() === term.toLowerCase())) return;
        terms.push(term);
        const chip = el('span', 'chip removable', `${term} ×`);
        chip.style.setProperty('--c', colorOf('CUSTOM'));
        chip.title = 'Click to stop hiding';
        chip.addEventListener('click', () => {
          terms.splice(terms.indexOf(term), 1);
          chip.remove();
          update();
        });
        chips.append(chip);
        update();
      }),
      chips,
    );

    const pagesWrap = el('div', 'pages');
    for (const page of r.pages) {
      if (!page.items.length && !page.preview_b64) continue;
      const block = el('div', 'page');
      block.append(el('div', 'page-label', page.label));
      if (page.preview_b64) block.append(frameFor(page));
      if (page.items.length) block.append(rowsFor(page.items));
      pagesWrap.append(block);
    }
    s.body.append(pagesWrap);

    function frameFor(page: AnalyzeFileResponse['pages'][number]): HTMLElement {
      const frame = el('div', 'frame drawable');
      const img = el('img');
      img.src = `data:image/jpeg;base64,${page.preview_b64}`;
      img.alt = page.label;
      img.draggable = false;
      frame.append(img);
      const pct = (b: number[], div: HTMLElement) => {
        const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = b;
        div.style.left = `${(x0 / page.width) * 100}%`;
        div.style.top = `${(y0 / page.height) * 100}%`;
        div.style.width = `${((x1 - x0) / page.width) * 100}%`;
        div.style.height = `${((y1 - y0) / page.height) * 100}%`;
      };
      for (const it of page.items) {
        for (const b of it.boxes) {
          const box = el('div', 'box');
          pct(b, box);
          box.style.setProperty('--c', colorOf(it.type));
          box.title = `${labelOf(it.type)}${it.value ? `: ${it.value}` : ''} · ${sourceLabel(it.source, it.score)}`;
          box.addEventListener('click', () => flip(it.id));
          reg(it.id, box);
          frame.append(box);
        }
      }

      // Drag to draw a box of your own; click it to remove it.
      const key = String(page.index);
      frame.addEventListener('pointerdown', (ev) => {
        if ((ev.target as HTMLElement).classList.contains('box')) return;
        ev.preventDefault();
        const rect = frame.getBoundingClientRect();
        const toPage = (cx: number, cy: number) => [
          Math.min(Math.max((cx - rect.left) / rect.width, 0), 1) * page.width,
          Math.min(Math.max((cy - rect.top) / rect.height, 0), 1) * page.height,
        ] as const;
        const [sx, sy] = toPage(ev.clientX, ev.clientY);
        const draft = el('div', 'box manual');
        frame.append(draft);
        let b = [sx, sy, sx, sy];
        const move = (e: PointerEvent) => {
          const [x, y] = toPage(e.clientX, e.clientY);
          b = [Math.min(sx, x), Math.min(sy, y), Math.max(sx, x), Math.max(sy, y)];
          pct(b, draft);
        };
        const up = () => {
          frame.removeEventListener('pointermove', move);
          frame.removeEventListener('pointerup', up);
          if (b[2]! - b[0]! < 6 || b[3]! - b[1]! < 6) return draft.remove();
          const list = (boxes[key] ??= []);
          const saved = b.map((v) => Math.round(v * 10) / 10);
          list.push(saved);
          draft.title = 'Hidden by you · click to remove';
          draft.addEventListener('click', () => {
            list.splice(list.indexOf(saved), 1);
            draft.remove();
            update();
          });
          update();
        };
        frame.setPointerCapture(ev.pointerId);
        frame.addEventListener('pointermove', move);
        frame.addEventListener('pointerup', up);
      });
      return frame;
    }

    function rowsFor(list: AnalyzeFileResponse['pages'][number]['items']): HTMLElement {
      const rows = el('div', 'rows');
      for (const it of list) {
        const row = el('label', 'row');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.id = it.id;
        cb.addEventListener('change', () => flip(it.id));
        const chip = el('span', 'chip', labelOf(it.type));
        chip.style.setProperty('--c', colorOf(it.type));
        row.append(cb, chip, el('span', 'val', it.value || '(image region)'), el('span', 'loc', it.location));
        reg(it.id, row);
        rows.append(row);
      }
      return rows;
    }

    const finish = (c: FileChoice) => {
      s.close();
      resolve(c);
    };
    const drawn = () => Object.values(boxes).reduce((a, l) => a + l.length, 0);
    const protect = button('', 'primary', () =>
      finish({
        action: 'protect',
        chosen: items.filter((i) => on.get(i.id)).map((i) => i.id),
        customBoxes: boxes,
        terms: [...terms],
      }),
    );
    function update() {
      const k = [...on.values()].filter(Boolean).length + drawn() + terms.length;
      setLabel(protect, k ? `Protect ${k} & upload` : 'Upload');
    }
    update();
    const left = el('div', 'left');
    left.append(keyHints('protect'));
    s.footer.append(
      left,
      button('Cancel', 'ghost', () => finish({ action: 'cancel' })),
      button('Upload original', 'danger', () => finish({ action: 'original' })),
      protect,
    );
    s.onDismiss(() => finish({ action: 'cancel' }));
    onKeys(s.overlay, () => protect.click(), () => finish({ action: 'cancel' }));
    protect.focus();
  });
}

const CSS_ESCAPE = (s: string) => s.replace(/["\\]/g, '\\$&');

// ---------- loading / errors / toasts ----------

export function loading(title: string, subtitle: string): () => void {
  const s = shell(title, subtitle);
  s.body.append(el('div', 'spinner'));
  return s.close;
}

export function offline(kind: 'paste' | 'upload', detail?: string): Promise<'original' | 'cancel'> {
  return new Promise((resolve) => {
    const s = shell(
      detail ? 'Kavach could not scan this' : 'Kavach engine is not running',
      detail ?? 'Start it on this laptop with ./run.sh, then try again.',
      null,
    );
    s.body.append(
      el('p', 'note', 'Nothing has been sent. You can cancel, or send the original without protection.'),
    );
    const finish = (c: 'original' | 'cancel') => {
      s.close();
      resolve(c);
    };
    const cancel = button('Cancel', 'primary', () => finish('cancel'));
    s.onDismiss(() => finish('cancel'));
    s.footer.append(
      el('div', 'left'),
      button(kind === 'paste' ? 'Paste original anyway' : 'Upload original anyway', 'danger', () => finish('original')),
      cancel,
    );
    onKeys(s.overlay, () => cancel.click(), () => finish('cancel'));
    cancel.focus();
  });
}

// Floating pill while real values are restored on screen, with a one-click
// switch to see exactly what the chatbot received.
let pill: HTMLElement | null = null;

export function restorePill(count: number, restoring: boolean, onToggle: () => void): void {
  const r = ensureRoot();
  if (!count && restoring) {
    pill?.remove();
    pill = null;
    return;
  }
  if (!pill || !pill.isConnected) {
    pill = el('div', 'pill');
    r.append(pill);
  }
  const logo = el('span', 'tlogo');
  logo.innerHTML = SHIELD;
  const msg = restoring
    ? `Showing ${count} real value${count === 1 ? '' : 's'} on your screen only`
    : 'Showing what the chatbot saw';
  pill.replaceChildren(
    logo,
    el('span', '', msg),
    button(restoring ? 'Show what the chatbot saw' : 'Show real values', 'ghost', onToggle),
  );
}

export function toast(message: string, action?: { label: string; run: () => void }, ms = 6000): void {
  const r = ensureRoot();
  const t = el('div', 'toast');
  const logo = el('span', 'tlogo');
  logo.innerHTML = SHIELD;
  t.append(logo, el('span', '', message));
  if (action) {
    const b = button(action.label, 'ghost', () => {
      action.run();
      t.remove();
    });
    t.append(b);
  }
  r.append(t);
  setTimeout(() => t.remove(), ms);
}
