// PDFs as material (docs/architecture.md §Material): a worksheet that came as a PDF
// (WhatsApp, IServ, Schul-Cloud, Dateien) goes to the model as it is — the model reads
// PDFs directly, one page report per PDF page. Code only counts the pages, so the page
// limit holds for PDFs exactly as it does for photos, and places each file's pages in
// the material's page numbering.

import { PDFDocument } from 'pdf-lib';

/** A material has at most 20 pages, photos and PDF pages together (like 20 photos). */
export const MAX_PAGES = 20;
/**
 * All PDFs of one material together: they travel inline to the model with the photos,
 * and the model call has an inline size limit. A 20-page scanned worksheet is ~5 MB.
 */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export const PDF_MIME = 'application/pdf';

/** The number of pages, or null when the file is not a PDF that can be opened. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number | null> {
  try {
    // Restrictions set by the author (no printing, no copying) do not stop reading; a PDF
    // that needs a password to open is read as far as the model can (usually not at all).
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const n = doc.getPageCount();
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export type MaterialFile = { position: number; page_count: number | null };

/** Where each file's pages sit in the material (1-based): a photo is one page. */
export function pageRanges(
  files: readonly MaterialFile[],
): Array<{ position: number; first: number; last: number }> {
  let next = 1;
  return [...files]
    .sort((a, b) => a.position - b.position)
    .map((f) => {
      const count = f.page_count ?? 1;
      const range = { position: f.position, first: next, last: next + count - 1 };
      next += count;
      return range;
    });
}

/** The files every page of which is in `pages` (e.g. a photo of something else). */
export function filesWhollyIn(
  files: readonly MaterialFile[],
  pages: ReadonlySet<number>,
): number[] {
  return pageRanges(files)
    .filter((r) => {
      for (let p = r.first; p <= r.last; p += 1) if (!pages.has(p)) return false;
      return true;
    })
    .map((r) => r.position);
}
