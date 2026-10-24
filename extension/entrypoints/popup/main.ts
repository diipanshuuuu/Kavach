import { colorOf, labelOf } from '@/lib/colors';
import { send } from '@/lib/messages';
import { getSettings, getStats, resetStats, setSettings } from '@/lib/settings';
import type { EntityType, Settings } from '@/lib/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function showStatus(): Promise<void> {
  const box = $('status');
  const text = $('status-text');
  const models = $('models');
  try {
    const h = await send({ type: 'HEALTH' });
    const info = await send({ type: 'INFO' }).catch(() => ({}) as Record<string, string | null>);
    box.className = 'status ok';
    text.textContent = 'Engine running on this laptop';
    const rows: [string, string | null | undefined][] = [
      ['Names (NER)', h.ner ? info.ner_model : 'loading…'],
      ['Deep scan', h.llm ? info.llm_model : 'off (start Ollama)'],
      ['OCR', h.ocr ? `Tesseract · ${info.ocr_langs}` : 'not installed'],
      ['Faces', info.face_detector ?? 'off'],
    ];
    models.replaceChildren(
      ...rows.map(([k, v]) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        const value = document.createElement('b');
        name.textContent = k;
        value.textContent = v ?? '—';
        li.append(name, value);
        return li;
      }),
    );
  } catch {
    box.className = 'status bad';
    text.textContent = 'Engine offline — run ./run.sh';
    models.replaceChildren();
  }
}

async function showStats(): Promise<void> {
  const s = await getStats();
  $('total').textContent = String(s.total);
  const wrap = $('by-type');
  wrap.replaceChildren(
    ...Object.entries(s.byType)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([t, n]) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.style.setProperty('--c', colorOf(t as EntityType));
        chip.textContent = `${n} × ${labelOf(t as EntityType)}`;
        return chip;
      }),
  );
}

async function initTerms(): Promise<void> {
  const s = await getSettings();
  const area = $<HTMLTextAreaElement>('terms');
  const count = $('terms-count');
  const show = (terms: string[]) => (count.textContent = terms.length ? `${terms.length} word${terms.length === 1 ? '' : 's'}` : 'none');
  area.value = s.customTerms.join('\n');
  show(s.customTerms);
  $('save-terms').addEventListener('click', async () => {
    const terms = [...new Set(area.value.split('\n').map((t) => t.trim()).filter((t) => t.length >= 2))];
    await setSettings({ customTerms: terms });
    area.value = terms.join('\n');
    show(terms);
    $('save-terms').textContent = 'Saved ✓';
  });
}

async function init(): Promise<void> {
  const s = await getSettings();
  for (const key of ['enabled', 'deep', 'restore'] as const satisfies readonly (keyof Settings)[]) {
    const input = $<HTMLInputElement>(key);
    input.checked = s[key];
    input.addEventListener('change', () => setSettings({ [key]: input.checked }));
  }
  await initTerms();
  $('clear').addEventListener('click', async () => {
    await send({ type: 'VAULT_CLEAR' });
    await resetStats();
    await showStats();
    $('clear').textContent = 'Forgotten ✓';
  });
  await Promise.all([showStatus(), showStats()]);
}

init();
