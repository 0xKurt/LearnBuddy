// The photos of one material as a reading request sees them (docs/architecture.md §Material).
// One place for the first reading and for a reading the learner's own answer asked for (issue
// #164): both send exactly the same labelled pages.

import type { Deps } from '../../deps.js';
import type { LlmPart } from '../../llm/gateway.js';
import { PDF_MIME, pageRanges } from './pdf.js';

type PhotoRow = {
  position: number;
  storage_path: string;
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  page_count: number | null;
};

/**
 * A photographed page as it came from Storage, in position order (PDFs are not among them: sharp
 * cannot crop a PDF page). The concept-image pass crops from these instead of downloading every
 * photo a second time (F4-a, #654).
 */
export type PageBytes = { mime: 'image/jpeg' | 'image/png'; bytes: Buffer };

/**
 * Each page is labelled, so a page number in the answer names this photo and not the model's
 * count of unlabelled images (p2-model-page-numbers-unlabeled-images); a PDF brings its pages in
 * one file, and its label says which page numbers they are.
 *
 * `missing` is the position of the first photo Storage does not have — nothing can be read then.
 * A Storage OUTAGE is not a missing photo and is thrown as such (`StorageError`), so a caller
 * never reports "photos missing" for a provider that was simply unreachable.
 */
export async function loadPhotos(
  deps: Deps,
  materialId: string,
): Promise<{ photos: PhotoRow[]; parts: LlmPart[]; pages: PageBytes[]; missing: number | null }> {
  const photos = await deps.db.query<PhotoRow>(
    `select position, storage_path, mime, page_count from material_photos
      where material_id = $1 order by position`,
    [materialId],
  );
  const ranges = pageRanges(photos);
  const pageTotal = ranges.at(-1)?.last ?? 0;
  const parts: LlmPart[] = [];
  const pages: PageBytes[] = [];
  for (const [i, p] of photos.entries()) {
    const bytes = await deps.storage.download(p.storage_path);
    if (!bytes) return { photos, parts, pages, missing: p.position };
    if (p.mime !== PDF_MIME) pages.push({ mime: p.mime, bytes: Buffer.from(bytes) });
    const range = ranges[i]!;
    parts.push({
      text:
        p.mime === PDF_MIME
          ? `PDF with pages ${range.first}–${range.last} of ${pageTotal} (one page report per PDF page):`
          : `Photo ${range.first} of ${pageTotal}:`,
    });
    parts.push({ inlineData: { mimeType: p.mime, data: Buffer.from(bytes).toString('base64') } });
  }
  return { photos, parts, pages, missing: null };
}
