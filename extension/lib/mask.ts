import type { Entity } from './types';

/** Replace each entity span with its placeholder. Works from the end so offsets stay valid. */
export function applyMask(text: string, entities: Entity[], placeholders: string[]): string {
  const order = entities.map((e, i) => [e, placeholders[i]] as const).sort((a, b) => b[0].start - a[0].start);
  let out = text;
  for (const [e, token] of order) out = out.slice(0, e.start) + token + out.slice(e.end);
  return out;
}

export const TOKEN_RE = /\[([A-Z]+(?:_[A-Z]+)*)_(\d+)\]/g;
