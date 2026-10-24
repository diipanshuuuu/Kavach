// File helpers for the content script.

const EXT = /\.(png|jpe?g|webp|pdf|pptx?)$/i;
const MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
]);

/** Files Kavach can scan: images, PDFs and PowerPoint. Everything else passes through. */
export const isScannable = (f: File) => MIMES.has(f.type) || EXT.test(f.name);

/** Files Kavach already produced are let through untouched. */
export const isProtected = (f: File) => /_kavach\.[a-z0-9]+$/i.test(f.name);

export function fileToB64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function b64ToFile(b64: string, name: string, mime: string): File {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime, lastModified: Date.now() });
}

export function download(f: File): void {
  const url = URL.createObjectURL(f);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function toDataTransfer(files: File[]): DataTransfer {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt;
}
