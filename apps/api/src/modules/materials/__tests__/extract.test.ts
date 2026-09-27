import { describe, expect, it } from 'vitest';

import { ExtractionResult } from '../extract.js';

const base = {
  is_learning_material: true,
  readable: true,
  title: 'Blatt',
  subject: null,
  extracted_text: 'Text',
  items: [],
  other_subject: null,
};

describe('extraction result', () => {
  it('keeps the valid page reports when one entry is broken (page-report-catch-all-or-nothing)', () => {
    const parsed = ExtractionResult.parse({
      ...base,
      pages: [
        { page: 1, read: 'all', problem: null },
        { page: 2, read: 'somewhat', problem: 'blurry' },
        { page: 3, read: 'part', problem: 'cut_off' },
      ],
    });
    expect(parsed.pages).toEqual([
      { page: 1, read: 'all', problem: null },
      { page: 3, read: 'part', problem: 'cut_off' },
    ]);
  });

  it('drops a page report that is not a list at all', () => {
    expect(ExtractionResult.parse({ ...base, pages: 'none' }).pages).toEqual([]);
  });
});
