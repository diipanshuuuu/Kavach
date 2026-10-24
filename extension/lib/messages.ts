// Typed messages between content script / popup and the background worker.
// Only the background worker talks to the local engine (content scripts on
// https:// pages can't call http://127.0.0.1).

import type {
  AnalyzeFileResponse,
  DetectResponse,
  Entity,
  EntityType,
  HealthResponse,
  RenderResponse,
} from './types';

export type Message =
  | { type: 'DETECT'; text: string; deep: boolean }
  | { type: 'MASK'; text: string; entities: Entity[] }
  | { type: 'ASSIGN'; items: { id: string; type: EntityType; value: string }[] }
  | { type: 'ANALYZE_FILE'; name: string; mime: string; b64: string; deep: boolean }
  | {
      type: 'RENDER';
      job_id: string;
      chosen: string[];
      placeholders: Record<string, string>;
      customBoxes: Record<string, number[][]>;
      terms: string[];
    }
  | { type: 'VAULT_GET' }
  | { type: 'VAULT_CLEAR' }
  | { type: 'HEALTH' }
  | { type: 'INFO' };

export interface Replies {
  DETECT: DetectResponse;
  MASK: { masked: string };
  ASSIGN: { placeholders: Record<string, string> };
  ANALYZE_FILE: AnalyzeFileResponse;
  RENDER: RenderResponse;
  VAULT_GET: { tokens: Record<string, string> };
  VAULT_CLEAR: { ok: true };
  HEALTH: HealthResponse;
  INFO: Record<string, string | null>;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export async function send<M extends Message>(msg: M): Promise<Replies[M['type']]> {
  const res = (await browser.runtime.sendMessage(msg)) as Envelope<Replies[M['type']]> | undefined;
  if (!res) throw new Error('No reply from Kavach background worker');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
