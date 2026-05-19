import { describe, expect, it } from 'vitest';

import { buildOpener, classifyOpenerTone, type EpisodeForOpener } from '../session-opener.js';

const epHigh: EpisodeForOpener = {
  one_sentence_arc: 'Worked through 6 fraction items, all correct.',
  concepts_touched: ['Brüche'],
  high_points: ['6 correct in a row', 'self-corrected on item 4'],
  low_points: [],
};

const epLow: EpisodeForOpener = {
  one_sentence_arc: 'Struggled with chain rule across 5 items.',
  concepts_touched: ['Kettenregel'],
  high_points: [],
  low_points: ['3 give-ups on item 2', '2 wrong before reveal on item 5'],
};

const epNeutral: EpisodeForOpener = {
  one_sentence_arc: 'Mixed session — some fraction work, some new derivatives.',
  concepts_touched: ['Brüche', 'Ableitungen'],
  high_points: ['nailed fraction addition'],
  low_points: ['1 give-up on derivatives'],
};

describe('classifyOpenerTone', () => {
  it('returns high when high points >= 2 and outnumber lows', () => {
    expect(classifyOpenerTone(epHigh)).toBe('high');
  });

  it('returns low when low points >= 2 and outnumber highs', () => {
    expect(classifyOpenerTone(epLow)).toBe('low');
  });

  it('returns neutral on near-balanced episodes', () => {
    expect(classifyOpenerTone(epNeutral)).toBe('neutral');
  });

  it('returns neutral when both sides have only 1 point each (under threshold)', () => {
    expect(
      classifyOpenerTone({
        one_sentence_arc: 'x',
        concepts_touched: ['x'],
        high_points: ['won'],
        low_points: ['lost'],
      }),
    ).toBe('neutral');
  });
});

describe('buildOpener', () => {
  it('returns null when no prior episode (cold-start)', () => {
    expect(buildOpener(null, 'de')).toBe(null);
  });

  it('references the first concept_touched, not the learner', () => {
    const o = buildOpener(epHigh, 'de')!;
    expect(o).toContain('Brüche');
    // L1 — no first-person analytical language
    expect(o.toLowerCase()).not.toMatch(/du bist|du warst|frustriert|gestresst/);
  });

  it('produces a DIFFERENT line for high vs low tones', () => {
    const high = buildOpener(epHigh, 'de')!;
    const low = buildOpener(
      { ...epLow, concepts_touched: ['Brüche'] }, // hold topic constant
      'de',
    )!;
    expect(high).not.toBe(low);
  });

  it('renders in all five locales without crashing', () => {
    for (const locale of ['de', 'en', 'fr', 'es', 'it'] as const) {
      const o = buildOpener(epHigh, locale)!;
      expect(o.length).toBeGreaterThan(10);
      expect(o).toContain('Brüche');
    }
  });

  it('falls back to a slice of one_sentence_arc when concepts_touched is empty', () => {
    const ep: EpisodeForOpener = {
      one_sentence_arc: 'A long arc with no specific concepts listed.',
      concepts_touched: [],
      high_points: [],
      low_points: [],
    };
    const o = buildOpener(ep, 'de')!;
    expect(o.length).toBeGreaterThan(10);
  });

  it('NEVER contains banned ability vocabulary in any locale', () => {
    const banned = ['smart', 'klug', 'klever', 'clever', 'genie', 'talent', 'gifted'];
    for (const locale of ['de', 'en', 'fr', 'es', 'it'] as const) {
      for (const ep of [epHigh, epLow, epNeutral]) {
        const o = buildOpener(ep, locale)!;
        for (const word of banned) {
          expect(o.toLowerCase()).not.toContain(word);
        }
      }
    }
  });
});
