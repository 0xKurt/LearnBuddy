// Worksheets that do not come from the camera (docs/architecture.md §Material): a file
// picked from "Dateien", shared from another app (WhatsApp, IServ, Schul-Cloud) or dropped
// into the browser. Photos go through the same preparation and check as camera photos; a
// PDF is sent as it is (the API counts its pages and the model reads it).

export const PDF_MIME = 'application/pdf';
/** All PDFs of one sheet together, as the API takes them (modules/materials/pdf.ts). */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_MB = 15;

/** One incoming file, whatever brought it. */
export type IncomingFile = {
  uri: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
};

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif|bmp)$/;

/** What a file is: its type when known, else its name; anything else is not taken. */
export function fileKind(f: IncomingFile): 'pdf' | 'image' | null {
  const mime = (f.mimeType ?? '').toLowerCase();
  const name = (f.name ?? f.uri).toLowerCase().split(/[?#]/)[0] ?? '';
  if (mime === PDF_MIME || f.uri.startsWith('data:application/pdf')) return 'pdf';
  if (mime.startsWith('image/') || f.uri.startsWith('data:image/')) return 'image';
  if (mime && mime !== 'application/octet-stream') return null;
  if (name.endsWith('.pdf')) return 'pdf';
  if (IMAGE_EXT.test(name)) return 'image';
  return null;
}

/** A short name for the PDF tile (the name as it came, without the path). */
export function displayName(f: IncomingFile): string {
  const raw = f.name ?? decodeURIComponent(f.uri.split(/[?#]/)[0]?.split('/').pop() ?? '');
  return raw.trim().length > 0 && !raw.startsWith('data:') ? raw.trim() : 'PDF';
}

/**
 * Sorts incoming files: what can be taken (in the order they came) and how many could not
 * (another file type). PDFs over the size limit together are left out, largest last.
 */
export function sortIncoming(
  files: readonly IncomingFile[],
  pdfBytesSoFar = 0,
): {
  take: Array<IncomingFile & { kind: 'pdf' | 'image' }>;
  unsupported: number;
  tooLarge: number;
} {
  const take: Array<IncomingFile & { kind: 'pdf' | 'image' }> = [];
  let unsupported = 0;
  let tooLarge = 0;
  let pdfBytes = pdfBytesSoFar;
  for (const f of files) {
    const kind = fileKind(f);
    if (!kind) {
      unsupported += 1;
      continue;
    }
    if (kind === 'pdf') {
      const size = f.size ?? 0;
      if (pdfBytes + size > MAX_PDF_BYTES) {
        tooLarge += 1;
        continue;
      }
      pdfBytes += size;
    }
    take.push({ ...f, kind });
  }
  return { take, unsupported, tooLarge };
}
