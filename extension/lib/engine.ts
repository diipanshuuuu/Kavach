// HTTP client for the local Kavach engine. Background worker only.

import type { AnalyzeFileResponse, DetectResponse, HealthResponse, MatchTermResponse, RenderResponse } from './types';

export const ENGINE_URL = 'http://127.0.0.1:8000';

export class EngineOffline extends Error {
  constructor() {
    super('ENGINE_OFFLINE');
  }
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENGINE_URL + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new EngineOffline();
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const health = () => call<HealthResponse>('/health', {}, 3_000);
export const info = () => call<Record<string, string | null>>('/info', {}, 5_000);

export const detect = (text: string, deep: boolean, terms: string[]) =>
  call<DetectResponse>('/detect', json({ text, deep, terms }), deep ? 60_000 : 20_000);

export function analyzeFile(name: string, mime: string, b64: string, deep: boolean, terms: string[]) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime || 'application/octet-stream' }), name);
  form.append('deep', String(deep));
  form.append('terms', JSON.stringify(terms));
  return call<AnalyzeFileResponse>('/analyze-file', { method: 'POST', body: form }, 180_000);
}

export const renderRedacted = (
  job_id: string,
  chosen: string[],
  placeholders: Record<string, string>,
  custom_boxes: Record<string, number[][]>,
  terms: string[],
) => call<RenderResponse>('/render-redacted', json({ job_id, chosen, placeholders, custom_boxes, terms }), 120_000);

export const matchTerm = (job_id: string, term: string) =>
  call<MatchTermResponse>('/match-term', json({ job_id, term }), 30_000);
