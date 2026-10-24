// The vault: placeholder <-> real value. Background worker only.
//
// - The same value always gets the same placeholder ("Rahul Sharma" is
//   [PERSON_1] in a paste AND in a PDF uploaded later), so chatbot answers
//   stay consistent and can be restored.
// - Stored in storage.session: kept in memory, wiped when the browser closes,
//   never written to disk, never sent anywhere.

import type { EntityType } from './types';

const KEY = 'kavach:vault';

interface Vault {
  byKey: Record<string, string>; // "PAN|ABCPE1234F" -> "[PAN_1]"
  byToken: Record<string, string>; // "[PAN_1]" -> "ABCPE1234F"
  counters: Partial<Record<EntityType, number>>;
}

const NUMERIC = new Set<EntityType>(['AADHAAR', 'VID', 'CARD', 'PHONE', 'BANK_ACCOUNT', 'PINCODE']);

function keyOf(type: EntityType, value: string): string {
  const v = NUMERIC.has(type)
    ? value.replace(/\D/g, '').replace(/^(?:91|0)(?=[6-9]\d{9}$)/, '')
    : value.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${type}|${v}`;
}

async function load(): Promise<Vault> {
  const got = await browser.storage.session.get(KEY);
  return (got[KEY] as Vault | undefined) ?? { byKey: {}, byToken: {}, counters: {} };
}

// Serialize writes so two quick pastes can't hand out the same number.
let chain: Promise<unknown> = Promise.resolve();

export function assign(items: { type: EntityType; value: string }[]): Promise<string[]> {
  const run = chain.then(async () => {
    const v = await load();
    const tokens = items.map(({ type, value }) => {
      const k = keyOf(type, value);
      if (!v.byKey[k]) {
        const n = (v.counters[type] ?? 0) + 1;
        v.counters[type] = n;
        const token = `[${type}_${n}]`;
        v.byKey[k] = token;
        v.byToken[token] = value;
      }
      return v.byKey[k];
    });
    await browser.storage.session.set({ [KEY]: v });
    return tokens;
  });
  chain = run.catch(() => {});
  return run;
}

export async function tokens(): Promise<Record<string, string>> {
  return (await load()).byToken;
}

export async function clear(): Promise<void> {
  await browser.storage.session.remove(KEY);
}
