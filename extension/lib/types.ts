// Mirrors engine/schemas.py — change both in the same commit.

export type EntityType =
  | 'PERSON' | 'LOCATION' | 'ORG' | 'ADDRESS' | 'MEDICAL' | 'OTHER'
  | 'AADHAAR' | 'VID' | 'PAN' | 'GSTIN' | 'VOTER_ID' | 'PASSPORT' | 'DL' | 'VEHICLE'
  | 'IFSC' | 'BANK_ACCOUNT' | 'CARD' | 'UPI'
  | 'PHONE' | 'EMAIL' | 'DOB' | 'PINCODE'
  | 'QR' | 'FACE'
  | 'CUSTOM'; // hidden by the user

export type Source = 'rule' | 'ner' | 'llm' | 'vision' | 'user';

export interface Entity {
  start: number;
  end: number;
  type: EntityType;
  value: string;
  source: Source;
  score: number;
  validated?: boolean;
}

export interface DetectResponse {
  entities: Entity[];
  timing_ms: Record<string, number>;
  // Added by the extension: the local engine, or the in-browser rules when it's offline.
  mode?: 'engine' | 'browser';
}

export interface HealthResponse {
  ok: boolean;
  ner: boolean;
  llm: boolean;
  ocr: boolean;
}

export interface FileItem {
  id: string;
  type: EntityType;
  value: string;
  source: Source;
  score: number;
  boxes: number[][]; // [x0, y0, x1, y1] in preview pixels
  location: string;
}

export interface FilePage {
  index: number;
  label: string;
  preview_b64: string | null;
  width: number;
  height: number;
  items: FileItem[];
}

export interface AnalyzeFileResponse {
  job_id: string;
  kind: 'image' | 'pdf' | 'pptx';
  filename: string;
  pages: FilePage[];
}

export interface RenderResponse {
  file_b64: string;
  mime: string;
  filename: string;
}

export interface MatchTermResponse {
  count: number;
  boxes: Record<string, number[][]>; // page index -> boxes in preview pixels
}

export interface Settings {
  enabled: boolean; // intercept pastes and uploads
  deep: boolean; // also run the Qwen3 deep scan
  restore: boolean; // show real values in chatbot replies
  customTerms: string[]; // the user's "always hide" words
}

export const DEFAULT_SETTINGS: Settings = { enabled: true, deep: false, restore: true, customTerms: [] };

export interface Stats {
  total: number;
  byType: Partial<Record<EntityType, number>>;
}
