import type { EntityType, Source } from './types';

// One colour per family of data, used by the review cards and the popup.
const FAMILY: Record<EntityType, [string, string]> = {
  PERSON: ['#7c3aed', 'Name'],
  LOCATION: ['#0891b2', 'Place'],
  ORG: ['#0d9488', 'Organisation'],
  ADDRESS: ['#0891b2', 'Address'],
  MEDICAL: ['#db2777', 'Medical'],
  OTHER: ['#64748b', 'ID / other'],
  AADHAAR: ['#dc2626', 'Aadhaar'],
  VID: ['#dc2626', 'Aadhaar VID'],
  PAN: ['#ea580c', 'PAN'],
  GSTIN: ['#ea580c', 'GSTIN'],
  VOTER_ID: ['#dc2626', 'Voter ID'],
  PASSPORT: ['#dc2626', 'Passport'],
  DL: ['#dc2626', 'Driving licence'],
  VEHICLE: ['#b45309', 'Vehicle no.'],
  IFSC: ['#ca8a04', 'IFSC'],
  BANK_ACCOUNT: ['#ca8a04', 'Bank account'],
  CARD: ['#ca8a04', 'Card number'],
  UPI: ['#ca8a04', 'UPI ID'],
  PHONE: ['#2563eb', 'Phone'],
  EMAIL: ['#2563eb', 'Email'],
  DOB: ['#4f46e5', 'Date of birth'],
  PINCODE: ['#0891b2', 'PIN code'],
  QR: ['#111827', 'QR / barcode'],
  FACE: ['#111827', 'Face photo'],
  CUSTOM: ['#be123c', 'Hidden by you'],
};

export const colorOf = (t: EntityType) => FAMILY[t]?.[0] ?? '#64748b';
export const labelOf = (t: EntityType) => FAMILY[t]?.[1] ?? t;

export function sourceLabel(source: Source, score: number, validated?: boolean): string {
  if (source === 'rule') return validated ? 'Rule · checksum ✓' : 'Rule';
  if (source === 'ner') return `NER model ${score.toFixed(2)}`;
  if (source === 'llm') return 'Qwen3 deep scan';
  if (source === 'user') return 'You';
  return 'Vision (codes / faces)';
}
