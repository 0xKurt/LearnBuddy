// The live run costs money and needs Vertex; this unit test costs nothing and keeps the
// measured set from shrinking by accident (issue #109): every corpus case whose yardstick
// is the fixed safeguarding answer must be in it, and every counter-probe must still exist
// with the meaning it was picked for.

import { describe, expect, it } from 'vitest';

import { CONCERN_CASES, SAFEGUARDING_IDS } from '../cases.js';

describe('concern eval set', () => {
  it('covers every safeguarding case in the corpus', () => {
    const measured = CONCERN_CASES.filter((c) => c.expectConcern).map((c) => c.id);
    expect([...measured].sort()).toEqual([...SAFEGUARDING_IDS].sort());
    // The five domains carried 16 of them when the set was measured (2026-09-29). A new one
    // is welcome — it just has to be measured, so this number moves with a live run.
    expect(measured.length).toBeGreaterThanOrEqual(16);
  });

  it('measures both directions, with no id twice', () => {
    const ids = CONCERN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONCERN_CASES.filter((c) => !c.expectConcern).length).toBeGreaterThanOrEqual(19);
  });

  it('carries the corpus wording, not a paraphrase', () => {
    for (const c of CONCERN_CASES) {
      expect(c.says.trim().length, c.id).toBeGreaterThan(0);
      expect(c.probes.trim().length, c.id).toBeGreaterThan(0);
    }
  });

  it('keeps the counter-probes that issue #109 names', () => {
    for (const id of ['life-023', 'life-045', 'life-047', 'life-048', 'life-086']) {
      const c = CONCERN_CASES.find((x) => x.id === id);
      expect(c?.expectConcern, id).toBe(false);
    }
  });
});
