import { DEFAULT_SETTINGS, type EntityType, type Settings, type Stats } from './types';

const SETTINGS = 'kavach:settings';
const STATS = 'kavach:stats';

export async function addCustomTerm(term: string): Promise<void> {
  const t = term.trim();
  if (t.length < 2) return;
  const s = await getSettings();
  if (!s.customTerms.some((x) => x.toLowerCase() === t.toLowerCase())) {
    await setSettings({ customTerms: [...s.customTerms, t] });
  }
}

export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.local.get(SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS]) cb({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS].newValue as Settings) });
  });
}

export async function getStats(): Promise<Stats> {
  const got = await browser.storage.local.get(STATS);
  return (got[STATS] as Stats | undefined) ?? { total: 0, byType: {} };
}

export async function addStats(types: EntityType[]): Promise<void> {
  if (!types.length) return;
  const s = await getStats();
  s.total += types.length;
  for (const t of types) s.byType[t] = (s.byType[t] ?? 0) + 1;
  await browser.storage.local.set({ [STATS]: s });
}

export async function resetStats(): Promise<void> {
  await browser.storage.local.remove(STATS);
}
