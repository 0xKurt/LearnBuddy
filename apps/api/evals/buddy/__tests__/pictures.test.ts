import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PICTURE_CASES, SKELETON_REPLY } from '../pictureCases.js';

type Recorded = {
  cases: Array<Parameters<(typeof PICTURE_CASES)[number]['check']>[0] & { id: string }>;
};
const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../records/${name}.json`, import.meta.url), 'utf8')) as Recorded;
const baseline = read('934-baseline');
const fixed = read('934-fixed');
const paraphrase = read('934-repeated-paraphrase');

describe('recorded picture evaluation (#934)', () => {
  for (const c of PICTURE_CASES) {
    it(`${c.id}: catches the recorded baseline and accepts the live fixed answer`, () => {
      const before = baseline.cases.find((r) => r.id === c.id)!;
      const after = fixed.cases.find((r) => r.id === c.id)!;
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(c.check(before)).not.toEqual([]);
      expect(c.check(after)).toEqual([]);
      expect(c.check({ ...after, pictures: [] })).not.toEqual([]);
      expect(c.check({ ...after, reply: '```text\n O\n```' })).not.toEqual([]);
      if (c.id === 'de_picture_followup') {
        expect(c.check({ ...after, reply: SKELETON_REPLY })).not.toEqual([]);
        const repeated = paraphrase.cases[0]!;
        expect(repeated.pictureReview?.repeats_explanation).toBe(true);
        expect(c.check(repeated)).not.toEqual([]);
      }
    });
  }
});
