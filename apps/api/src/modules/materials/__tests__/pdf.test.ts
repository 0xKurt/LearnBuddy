import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { filesWhollyIn, pageRanges, pdfPageCount } from '../pdf.js';

describe('PDF pages in a material', () => {
  it('places each file in the page numbering (a photo is one page)', () => {
    const files = [
      { position: 1, page_count: 3 },
      { position: 0, page_count: null },
      { position: 2, page_count: null },
    ];
    expect(pageRanges(files)).toEqual([
      { position: 0, first: 1, last: 1 },
      { position: 1, first: 2, last: 4 },
      { position: 2, first: 5, last: 5 },
    ]);
    // Only files all of whose pages are listed.
    expect(filesWhollyIn(files, new Set([1, 3, 5]))).toEqual([0, 2]);
    expect(filesWhollyIn(files, new Set([2, 3, 4]))).toEqual([1]);
    expect(filesWhollyIn(files, new Set())).toEqual([]);
  });

  it('counts pages of a real PDF; anything else is not one', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    expect(await pdfPageCount(await doc.save())).toBe(2);
    expect(await pdfPageCount(await doc.save({ useObjectStreams: false }))).toBe(2);
    expect(await pdfPageCount(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(await pdfPageCount(new Uint8Array())).toBeNull();
  });
});
