// Background worker: the only part of the extension that talks to the local
// engine, and the only part that holds the vault.

import * as engine from '@/lib/engine';
import { detectLocal } from '@/lib/local-detect';
import { applyMask } from '@/lib/mask';
import type { Message, Replies } from '@/lib/messages';
import { addStats, getSettings } from '@/lib/settings';
import type { DetectResponse } from '@/lib/types';
import * as vault from '@/lib/vault';

/**
 * 1. Local engine (all three layers) when it's running.
 * 2. Otherwise in-browser rules + checksums: IDs and numbers are still masked,
 *    with no network call. The user can hide names by hand in the review card.
 */
async function detectWithFallback(text: string, deep: boolean): Promise<DetectResponse> {
  const { customTerms } = await getSettings();
  try {
    return { ...(await engine.detect(text, deep, customTerms)), mode: 'engine' };
  } catch (e) {
    if (!(e instanceof engine.EngineOffline)) throw e;
  }
  const t0 = performance.now();
  const entities = detectLocal(text, customTerms);
  return { entities, timing_ms: { rules: Math.round(performance.now() - t0) }, mode: 'browser' };
}

async function handle(msg: Message): Promise<Replies[Message['type']]> {
  switch (msg.type) {
    case 'HEALTH':
      return engine.health();
    case 'INFO':
      return engine.info();
    case 'DETECT':
      return detectWithFallback(msg.text, msg.deep);
    case 'MASK': {
      const tokens = await vault.assign(msg.entities);
      await addStats(msg.entities.map((e) => e.type));
      return { masked: applyMask(msg.text, msg.entities, tokens) };
    }
    case 'ASSIGN': {
      // Codes and faces are blurred, not labelled, and have no value to restore.
      const withValue = msg.items.filter((i) => i.value);
      const tokens = await vault.assign(withValue);
      const placeholders: Record<string, string> = {};
      withValue.forEach((i, k) => (placeholders[i.id] = tokens[k] ?? `[${i.type}]`));
      for (const i of msg.items) if (!i.value) placeholders[i.id] = '';
      await addStats(msg.items.map((i) => i.type));
      return { placeholders };
    }
    case 'ANALYZE_FILE': {
      const { customTerms } = await getSettings();
      return engine.analyzeFile(msg.name, msg.mime, msg.b64, msg.deep, customTerms);
    }
    case 'RENDER':
      return engine.renderRedacted(msg.job_id, msg.chosen, msg.placeholders, msg.customBoxes, msg.terms);
    case 'MATCH_TERM':
      return engine.matchTerm(msg.job_id, msg.term);
    case 'VAULT_GET':
      return { tokens: await vault.tokens() };
    case 'VAULT_CLEAR':
      await vault.clear();
      return { ok: true };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
    return true; // keep the channel open for the async reply
  });
});
