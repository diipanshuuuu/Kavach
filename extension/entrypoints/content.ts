// Kavach content script: runs on chatbot pages.
//
// 1. Paste text  -> detect locally -> review card -> masked text goes in.
// 2. Upload / drop / paste a file -> scan locally -> review card -> the
//    redacted file is handed to the site instead of the original.
// 3. Replies containing [PERSON_1]-style tokens get the real values back,
//    on this screen only.
//
// We listen on window in the CAPTURE phase so we run before the site's own
// handlers, and we stop the original event so the site never sees raw data.

import { isKavachNode, loading, offline, restorePill, reviewFile, reviewText, toast } from '@/components/ui';
import { b64ToFile, download, fileToB64, isProtected, isScannable, toDataTransfer } from '@/lib/files';
import { send } from '@/lib/messages';
import { setRestore, setTokens, startRehydrator } from '@/lib/rehydrate';
import { getSettings, onSettingsChanged, setSettings } from '@/lib/settings';
import { DEFAULT_SETTINGS, type DetectResponse, type Entity, type Settings } from '@/lib/types';

export default defineContentScript({
  matches: [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://gemini.google.com/*',
    'https://claude.ai/*',
    'https://www.perplexity.ai/*',
    'https://copilot.microsoft.com/*',
    'https://chat.deepseek.com/*',
    'http://127.0.0.1:8000/test*', // engine's local test page
  ],
  runAt: 'document_start',
  main() {
    let settings: Settings = DEFAULT_SETTINGS;
    getSettings().then((s) => {
      settings = s;
      setRestore(s.restore);
    });
    onSettingsChanged((s) => {
      settings = s;
      setRestore(s.restore);
    });

    // Events we dispatch ourselves must pass straight through.
    const ours = new WeakSet<Event>();

    // ---------- helpers ----------

    const EDITABLE = 'textarea, input[type="text"], input:not([type]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

    function composerOf(target: EventTarget | null): HTMLElement | null {
      const el = target instanceof Element ? target : (target as Node | null)?.parentElement;
      if (!el || isKavachNode(el)) return null;
      return el.closest<HTMLElement>(EDITABLE);
    }

    type Caret = { el: HTMLElement; range?: Range; start?: number; end?: number };

    function saveCaret(el: HTMLElement): Caret {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return { el, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length };
      }
      const sel = window.getSelection();
      return { el, range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : undefined };
    }

    function restoreCaret(c: Caret): void {
      c.el.focus();
      if (c.el instanceof HTMLTextAreaElement || c.el instanceof HTMLInputElement) {
        c.el.setSelectionRange(c.start ?? 0, c.end ?? 0);
      } else if (c.range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(c.range);
      }
    }

    /** Put text into the chat box the way the site expects. */
    function insertText(c: Caret, text: string): void {
      restoreCaret(c);
      const el = c.el;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        if (!document.execCommand('insertText', false, text)) {
          el.setRangeText(text, c.start ?? 0, c.end ?? 0, 'end');
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
        }
        return;
      }
      // Rich editors (ProseMirror on ChatGPT/Claude, Quill on Gemini) handle a
      // paste event best: it keeps line breaks and paragraphs.
      const before = el.textContent;
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: toDataTransfer([]) });
      ev.clipboardData?.setData('text/plain', text);
      ours.add(ev);
      el.dispatchEvent(ev);
      setTimeout(() => {
        if (el.textContent === before) {
          restoreCaret(c);
          document.execCommand('insertText', false, text);
        }
      }, 60);
    }

    async function refreshTokens(): Promise<void> {
      try {
        setTokens((await send({ type: 'VAULT_GET' })).tokens);
      } catch {}
    }

    // ---------- 1. text paste ----------

    async function protectText(caret: Caret, text: string): Promise<void> {
      let deep = settings.deep;
      for (;;) {
        const close = deep ? loading('Deep scan running…', 'Qwen3 is reading the text locally. This takes a few seconds.') : () => {};
        let entities: Entity[];
        let timing = '';
        let result: DetectResponse;
        try {
          result = await send({ type: 'DETECT', text, deep });
          entities = result.entities;
          const t = result.timing_ms;
          const total = Object.values(t).reduce((a, b) => a + b, 0);
          timing =
            result.mode === 'browser'
              ? `Checked in this browser in ${t.rules ?? 0} ms`
              : `Checked in ${total} ms on this laptop · rules ${t.rules ?? 0} ms · NER ${t.ner ?? 0} ms${t.llm !== undefined ? ` · Qwen3 ${t.llm} ms` : ''}`;
        } catch (e) {
          close();
          if ((await offline('paste', (e as Error).message === 'ENGINE_OFFLINE' ? undefined : (e as Error).message)) === 'original') {
            insertText(caret, text);
          }
          return;
        }
        close();

        // With the full engine, a clean paste goes straight through. In browser-only
        // mode detection is weaker, so always show the card for manual hiding.
        if (!entities.length && result.mode !== 'browser') {
          if (deep) toast('Kavach found nothing sensitive. Pasted as is.');
          return insertText(caret, text);
        }

        const choice = await reviewText(text, entities, { deepDone: deep, timing, mode: result.mode });
        if (choice.action === 'deep') {
          deep = true;
          continue;
        }
        if (choice.action === 'cancel') return;
        if (choice.action === 'original' || !choice.entities.length) return insertText(caret, text);

        const { masked } = await send({ type: 'MASK', text, entities: choice.entities });
        insertText(caret, masked);
        await refreshTokens();
        toast(`Protected ${choice.entities.length} item${choice.entities.length === 1 ? '' : 's'}. Real values stay on this laptop.`);
        return;
      }
    }

    // ---------- 2. files ----------

    /** Scan and redact each scannable file. Returns the files to hand over, or null to cancel. */
    async function protectFiles(files: File[]): Promise<File[] | null> {
      const out: File[] = [];
      for (const f of files) {
        if (!isScannable(f) || isProtected(f)) {
          out.push(f);
          continue;
        }
        const close = loading(`Scanning ${f.name}…`, 'Reading the file locally with OCR and open-weight models.');
        let analysis;
        try {
          analysis = await send({ type: 'ANALYZE_FILE', name: f.name, mime: f.type, b64: await fileToB64(f), deep: settings.deep });
        } catch (e) {
          close();
          const msg = (e as Error).message;
          if ((await offline('upload', msg === 'ENGINE_OFFLINE' ? undefined : msg)) === 'original') out.push(f);
          else return null;
          continue;
        }
        close();

        // Always review files: even when nothing is found, the user can draw boxes.
        const items = analysis.pages.flatMap((p) => p.items);
        const choice = await reviewFile(analysis);
        if (choice.action === 'cancel') return null;
        const manualCount = Object.values(choice.action === 'protect' ? choice.customBoxes : {}).flat().length;
        if (choice.action === 'original' || (!choice.chosen.length && !manualCount && !choice.terms.length)) {
          out.push(f);
          continue;
        }
        const chosenItems = items.filter((i) => choice.chosen.includes(i.id));
        const closeR = loading(`Protecting ${f.name}…`, 'Drawing redactions locally.');
        try {
          const { placeholders } = await send({
            type: 'ASSIGN',
            items: chosenItems.map((i) => ({ id: i.id, type: i.type, value: i.value })),
          });
          const r = await send({
            type: 'RENDER',
            job_id: analysis.job_id,
            chosen: choice.chosen,
            placeholders,
            customBoxes: choice.customBoxes,
            terms: choice.terms,
          });
          out.push(b64ToFile(r.file_b64, r.filename, r.mime));
        } catch (e) {
          closeR();
          toast(`Could not protect ${f.name}: ${(e as Error).message}`);
          return null;
        }
        closeR();
        await refreshTokens();
      }
      return out;
    }

    function offerDownload(files: File[]): void {
      const prot = files.filter(isProtected);
      if (!prot.length) return;
      toast(
        `Protected ${prot.map((f) => f.name).join(', ')}. If it didn't attach, download it and drop it in.`,
        { label: 'Download', run: () => prot.forEach(download) },
        12_000,
      );
    }

    function findFileInput(): HTMLInputElement | null {
      return document.querySelector<HTMLInputElement>('input[type="file"]:not([disabled])');
    }

    /** Hand files to the site through its own file input. */
    function giveToInput(input: HTMLInputElement, files: File[]): void {
      input.files = toDataTransfer(files).files;
      for (const type of ['input', 'change']) {
        const ev = new Event(type, { bubbles: true });
        ours.add(ev);
        input.dispatchEvent(ev);
      }
    }

    const needsScan = (files: File[]) => settings.enabled && files.some((f) => isScannable(f) && !isProtected(f));

    // 📎 attach button -> <input type=file>
    function onFileInput(e: Event): void {
      const input = e.target;
      if (ours.has(e) || !(input instanceof HTMLInputElement) || input.type !== 'file') return;
      const files = [...(input.files ?? [])];
      if (!files.length || !needsScan(files)) return;
      e.stopImmediatePropagation();
      if (e.type === 'input') return; // handle once, on 'change'
      protectFiles(files).then((clean) => {
        if (!clean) {
          input.value = '';
          return;
        }
        giveToInput(input, clean);
        offerDownload(clean);
      });
    }
    window.addEventListener('input', onFileInput, true);
    window.addEventListener('change', onFileInput, true);

    // drag and drop
    window.addEventListener(
      'drop',
      (e) => {
        if (ours.has(e) || !e.dataTransfer?.files.length) return;
        const files = [...e.dataTransfer.files];
        if (!needsScan(files)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const target = e.target as Element;
        const { clientX, clientY } = e;
        protectFiles(files).then((clean) => {
          if (!clean) return;
          const ev = new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: toDataTransfer(clean) });
          ours.add(ev);
          const handled = !target.dispatchEvent(ev); // site called preventDefault -> it took the files
          if (!handled) {
            const input = findFileInput();
            if (input) giveToInput(input, clean);
          }
          offerDownload(clean);
        });
      },
      true,
    );

    // paste (text, or files such as screenshots)
    window.addEventListener(
      'paste',
      (e) => {
        if (ours.has(e) || !settings.enabled) return;
        const composer = composerOf(e.target);
        const files = [...(e.clipboardData?.files ?? [])];

        if (files.length && needsScan(files)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const target = (composer ?? e.target) as Element;
          protectFiles(files).then((clean) => {
            if (!clean) return;
            const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: toDataTransfer(clean) });
            ours.add(ev);
            const handled = !target.dispatchEvent(ev);
            if (!handled) {
              const input = findFileInput();
              if (input) giveToInput(input, clean);
            }
            offerDownload(clean);
          });
          return;
        }

        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (!composer || !text.trim()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        protectText(saveCaret(composer), text);
      },
      true,
    );

    // ---------- 3. restore real values in replies ----------

    let hadRestored = false;
    startRehydrator({
      skip: isKavachNode,
      onChange: (count, restoring) => {
        // Only show the pill once something has been restored in this tab.
        hadRestored ||= count > 0;
        if (hadRestored) restorePill(count, restoring, () => setSettings({ restore: !restoring }));
      },
    });
    refreshTokens();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshTokens();
    });
  },
});
