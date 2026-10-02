// The curriculum table and its two readers (issue #214).
//
// What these tests hold:
//   - the table itself is checkable: every place has at least one state, every ruling names a
//     document, no entry claims a state the contract does not know;
//   - `null`, `other` and an unresearched Bundesland behave IDENTICALLY — the same text, the
//     same decisions. That is the state every learner is in today, so it is tested first;
//   - two states get two different rulings for the same place;
//   - nothing is dropped out of ignorance.

import { describe, expect, it } from 'vitest';

import { CurriculumRegion } from '@learnbuddy/shared-types/contracts';

import {
  CURRICULUM,
  CurriculumPointId,
  STATE_NAMES,
  cautiousAt,
  curriculumBlock,
  curriculumLine,
  offCurriculum,
  pointOf,
  pointsAt,
  rulingAt,
} from '../state.js';

/** Every state code the contract knows, `other` aside. */
const STATES = CurriculumRegion.options.filter((r) => r !== 'other');

describe('the table', () => {
  it('has an entry for every place, and every place has at least one researched state', () => {
    for (const point of CurriculumPointId.options) {
      const p = CURRICULUM[point];
      expect(p.about.length, point).toBeGreaterThan(10);
      expect(p.name.length, point).toBeGreaterThan(3);
      expect(p.subject.length, point).toBeGreaterThan(2);
      expect(Object.keys(p.states).length, point).toBeGreaterThanOrEqual(1);
      expect(p.verifiedIn, point).toContain('docs/lehrplan-und-uebungsformen.md');
      const [from, to] = p.grades;
      expect(from, point).toBeGreaterThanOrEqual(5);
      expect(to, point).toBeLessThanOrEqual(13);
      expect(from, point).toBeLessThanOrEqual(to);
    }
  });

  it('names a curriculum, a state and a year for every single ruling', () => {
    // Without this an entry is an unsourced claim about what counts in a child's exam
    // (CLAUDE.md rule 5), and nobody can check it again in six months.
    for (const point of CurriculumPointId.options) {
      for (const [state, ruling] of Object.entries(CURRICULUM[point].states)) {
        const where = `${point}/${state}`;
        expect(STATES, where).toContain(state);
        expect(ruling.source.length, where).toBeGreaterThan(20);
        // A year, a date or an explicit note that the report does not date the document.
        expect(ruling.source, where).toMatch(/(19|20)\d{2}|nicht datiert|nicht einzeln benannt/);
        expect(ruling.expects.length, where).toBeGreaterThan(20);
        if (ruling.grades) {
          expect(ruling.grades[0], where).toBeLessThanOrEqual(ruling.grades[1]);
        }
      }
    }
  });

  it('can name all sixteen Bundesländer', () => {
    for (const state of STATES) expect(STATE_NAMES[state].length).toBeGreaterThan(5);
  });

  it('reads a key it does not know as "no place"', () => {
    expect(pointOf(null)).toBeNull();
    expect(pointOf('a_place_removed_from_the_table')).toBeNull();
    expect(pointOf('satzglieder')).toBe('satzglieder');
  });
});

describe('what applies to whom', () => {
  it('gives two states two different rulings for the same place', () => {
    const bayern = rulingAt('satzglieder', 'by', 6);
    const nrw = rulingAt('satzglieder', 'nw', 6);
    expect(bayern?.applies).toBe('yes');
    expect(nrw?.applies).toBe('yes');
    expect(bayern?.ruling.expects).not.toBe(nrw?.ruling.expects);
    // Bayern names the case, NRW does not — the difference the report measured.
    expect(bayern?.ruling.expects).toContain('Dativobjekt');
    expect(nrw?.ruling.expects).toContain('without the case');
  });

  it('says when a place is not in her state at all, and when it is not at her year', () => {
    expect(rulingAt('hypothesentest', 'nw', 12)?.applies).toBe('not_in_her_curriculum');
    expect(rulingAt('hypothesentest', 'bw', 12)?.applies).toBe('yes');
    // Brandenburg places the metre at year 10; in year 7 it is not her material yet.
    expect(rulingAt('metrum', 'bb', 7)?.applies).toBe('not_at_her_year');
    expect(rulingAt('metrum', 'bb', 10)?.applies).toBe('yes');
    expect(rulingAt('metrum', 'bw', 7)?.applies).toBe('yes');
  });

  it('only offers the places that can come up in her school year', () => {
    expect(pointsAt(6)).toContain('satzglieder');
    expect(pointsAt(6)).not.toContain('hypothesentest');
    expect(pointsAt(12)).toContain('hypothesentest');
    expect(pointsAt(12)).not.toContain('satzglieder');
    // No year, nothing claimed.
    expect(pointsAt(null)).toEqual([]);
  });
});

describe('other, null and an unresearched state are one state', () => {
  // This is the path EVERY learner is on until a Bundesland is both set and researched, so it
  // is the one that has to be right. `he` stands for the ten states nobody has read yet.
  const unknown = [null, 'other', 'he', 'sl', 'mv'] as const;

  it('applies no rule and asks for caution, whichever it is', () => {
    for (const region of unknown) {
      for (const point of CurriculumPointId.options) {
        expect(rulingAt(point, region, 6), `${region}/${point}`).toBeNull();
        expect(cautiousAt(point, region, 6), `${region}/${point}`).toBe(true);
        expect(offCurriculum(point, region, 6), `${region}/${point}`).toBe(false);
      }
    }
  });

  it('writes the same prompt block, word for word', () => {
    const reference = curriculumBlock({ region: null, grade: 6 });
    expect(reference).not.toBeNull();
    for (const region of unknown) {
      expect(curriculumBlock({ region, grade: 6 }), String(region)).toBe(reference);
      expect(curriculumBlock({ region, grade: 12 }), String(region)).toBe(
        curriculumBlock({ region: null, grade: 12 }),
      );
    }
  });

  it('writes the same judging line, word for word', () => {
    const reference = curriculumLine({ point: 'satzglieder', region: null, grade: 6 });
    for (const region of unknown) {
      expect(curriculumLine({ point: 'satzglieder', region, grade: 6 }), String(region)).toBe(
        reference,
      );
    }
  });

  it('never names a Bundesland it has no rule for', () => {
    for (const region of unknown) {
      const block = curriculumBlock({ region, grade: 6 }) ?? '';
      for (const state of STATES)
        expect(block, `${region}/${state}`).not.toContain(STATE_NAMES[state]);
    }
  });

  it('tells the judge to stay with partially_correct when it is not certain', () => {
    const line = curriculumLine({ point: 'satzglieder', region: 'other', grade: 6 }) ?? '';
    expect(line).toContain('no state');
    expect(line).toContain('partially_correct');
    expect(line).not.toContain('Bundesland: ');
  });
});

describe('the prompt block', () => {
  it('names her state and carries its ruling when one was read', () => {
    const block = curriculumBlock({ region: 'by', grade: 6 }) ?? '';
    expect(block).toContain('Bundesland: Bayern');
    expect(block).toContain('[satzglieder]');
    expect(block).toContain('Dativobjekt');
    // The place Bayern does not teach is marked as such, not silently left out.
    expect(block).toContain('NOT IN HER CURRICULUM in Bayern');
  });

  it('falls back to the cautious line for a place her state was not read for', () => {
    // Niedersachsen is read for `operator_vergleichen` but not for `klimaklassifikation`.
    const block = curriculumBlock({ region: 'ni', grade: 12 }) ?? '';
    expect(block).toContain('Bundesland: Niedersachsen');
    expect(block).toContain('No curriculum was read for her state here');
  });

  it('says nothing at all without a school year', () => {
    expect(curriculumBlock({ region: 'by', grade: null })).toBeNull();
    expect(curriculumLine({ point: null, region: 'by', grade: 6 })).toBeNull();
  });
});

describe('what code drops', () => {
  it('drops a place her state does not teach, and keeps the one it does', () => {
    expect(offCurriculum('hypothesentest', 'nw', 12)).toBe(true);
    expect(offCurriculum('hypothesentest', 'by', 12)).toBe(true);
    expect(offCurriculum('hypothesentest', 'bw', 12)).toBe(false);
    expect(offCurriculum('hypothesentest', 'be', 12)).toBe(false);
  });

  it('never drops out of ignorance', () => {
    // No state, a school abroad, an unresearched state, no tag: all keep the question.
    expect(offCurriculum('hypothesentest', null, 12)).toBe(false);
    expect(offCurriculum('hypothesentest', 'other', 12)).toBe(false);
    expect(offCurriculum('hypothesentest', 'he', 12)).toBe(false);
    expect(offCurriculum(null, 'nw', 12)).toBe(false);
  });

  it('drops a place her state teaches only later', () => {
    expect(offCurriculum('metrum', 'bb', 7)).toBe(true);
    expect(offCurriculum('metrum', 'bb', 10)).toBe(false);
  });
});
