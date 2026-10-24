// Restore real values in chatbot replies, on this screen only.
//
// The chatbot only ever saw "[PERSON_1]". When a reply contains a token we
// know, we swap the text node's value for the real one. We never add or
// remove DOM nodes, so React and friends that own the page don't break; when
// they re-render a node we simply restore it again.

import { TOKEN_RE } from './mask';

let tokens: Record<string, string> = {};
let enabled = true;
const restored = new Map<Text, { original: string; count: number }>();
const pending = new Set<Node>();
let timer: number | undefined;
let skip: (n: Node) => boolean = () => false;
let onChange: (count: number, enabled: boolean) => void = () => {};

function editable(n: Node): boolean {
  const e = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
  return !!e?.closest('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
}

function restoreNode(node: Text): void {
  const original = node.nodeValue ?? '';
  if (!original.includes('[') || editable(node) || skip(node)) return;

  let count = 0;
  const out = original.replace(TOKEN_RE, (token) => {
    const real = tokens[token];
    if (!real) return token;
    count++;
    return real;
  });
  if (!count) return;
  restored.set(node, { original, count });
  node.nodeValue = out;
}

function scan(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) return restoreNode(root as Text);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) restoreNode(n as Text);
}

function report(): void {
  let count = 0;
  for (const [node, r] of restored) {
    if (node.isConnected) count += r.count;
    else restored.delete(node);
  }
  onChange(count, enabled);
}

function flush(): void {
  timer = undefined;
  if (enabled && Object.keys(tokens).length) {
    for (const n of pending) if (n.isConnected) scan(n);
  }
  pending.clear();
  report();
}

export function startRehydrator(opts: { skip: (n: Node) => boolean; onChange: (count: number, enabled: boolean) => void }): void {
  skip = opts.skip;
  onChange = opts.onChange;
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') pending.add(m.target);
      else m.addedNodes.forEach((n) => pending.add(n));
    }
    if (pending.size && timer === undefined) timer = window.setTimeout(flush, 200);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

export function setTokens(next: Record<string, string>): void {
  tokens = next;
  if (document.body) pending.add(document.body);
  flush();
}

/** Turn restoring on/off. Off puts the placeholders back so you can see what the chatbot saw. */
export function setRestore(on: boolean): void {
  if (on === enabled) return;
  enabled = on;
  if (!on) {
    for (const [node, r] of restored) if (node.isConnected) node.nodeValue = r.original;
    restored.clear();
    onChange(0, false);
    return;
  }
  if (document.body) pending.add(document.body);
  flush();
}
