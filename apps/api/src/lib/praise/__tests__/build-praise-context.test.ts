import { describe, expect, it } from 'vitest';

import {
  buildPraiseFastPath,
  buildPraiseRubricFragment,
  classifyPraise,
  type Locale,
} from '../build-praise-context.js';

const baseInput = {
  hintsUsed: 0,
  itemDifficulty: 2,
  itemAnswerKind: 'numeric',
  itemTopic: null,
  learnerTextWordCount: 1,
  priorWrongAttemptsOnItem: 0,
};

describe('classifyPraise', () => {
  it('classifies a hint-free easy correct as first_try_easy', () => {
    const p = classifyPraise({ ...baseInput, itemDifficulty: 1 });
    expect(p.kind).toBe('first_try_easy');
    if (p.kind === 'first_try_easy') {
      expect(p.difficulty).toBe(1);
    }
  });

  it('classifies a hint-free correct on a difficulty-4 item as first_try_hard', () => {
    const p = classifyPraise({ ...baseInput, itemDifficulty: 4, itemTopic: 'Erwartungswert' });
    expect(p.kind).toBe('first_try_hard');
    if (p.kind === 'first_try_hard') {
      expect(p.difficulty).toBe(4);
      expect(p.topic).toBe('Erwartungswert');
    }
  });

  it('classifies as effort_after_hints when hints were used and answer is correct', () => {
    const p = classifyPraise({
      ...baseInput,
      hintsUsed: 2,
      itemDifficulty: 3,
      itemTopic: 'Brüche',
    });
    expect(p.kind).toBe('effort_after_hints');
    if (p.kind === 'effort_after_hints') {
      expect(p.hints).toBe(2);
      expect(p.topic).toBe('Brüche');
    }
  });

  it('classifies as self_corrected when learner fixed their own prior wrong attempt', () => {
    const p = classifyPraise({
      ...baseInput,
      hintsUsed: 0,
      priorWrongAttemptsOnItem: 1,
      itemDifficulty: 3,
    });
    expect(p.kind).toBe('self_corrected');
    if (p.kind === 'self_corrected') {
      expect(p.priorAttempts).toBe(1);
    }
  });

  it('classifies as reasoned_not_recalled on a long-answer conceptual item with substantive text', () => {
    const p = classifyPraise({
      ...baseInput,
      itemAnswerKind: 'short',
      itemDifficulty: 3,
      itemTopic: 'Erwartungswert',
      learnerTextWordCount: 12,
    });
    expect(p.kind).toBe('reasoned_not_recalled');
  });

  it('does NOT classify as reasoned_not_recalled when answer is short (just stated)', () => {
    const p = classifyPraise({
      ...baseInput,
      itemAnswerKind: 'short',
      itemDifficulty: 3,
      itemTopic: 'Erwartungswert',
      learnerTextWordCount: 2,
    });
    // 2 words on a hard short-item → falls through to first_try_hard
    expect(p.kind).toBe('first_try_hard');
  });

  it('does NOT classify as reasoned_not_recalled on a numeric/MC item even with long text', () => {
    const p = classifyPraise({
      ...baseInput,
      itemAnswerKind: 'numeric',
      itemDifficulty: 3,
      learnerTextWordCount: 20,
    });
    expect(p.kind).toBe('first_try_hard');
  });

  it('prioritizes self_corrected over first_try_hard when both could apply', () => {
    const p = classifyPraise({
      ...baseInput,
      hintsUsed: 0,
      priorWrongAttemptsOnItem: 2,
      itemDifficulty: 4,
    });
    expect(p.kind).toBe('self_corrected');
  });

  it('prioritizes effort_after_hints over self_corrected when hints were used', () => {
    const p = classifyPraise({
      ...baseInput,
      hintsUsed: 1,
      priorWrongAttemptsOnItem: 1,
      itemDifficulty: 3,
    });
    expect(p.kind).toBe('effort_after_hints');
  });

  it('clamps out-of-range difficulty', () => {
    const lo = classifyPraise({ ...baseInput, itemDifficulty: 0 });
    expect(lo.kind).toBe('first_try_easy');
    if (lo.kind === 'first_try_easy') expect(lo.difficulty).toBe(1);

    const hi = classifyPraise({ ...baseInput, itemDifficulty: 99 });
    expect(hi.kind).toBe('first_try_hard');
    if (hi.kind === 'first_try_hard') expect(hi.difficulty).toBe(5);
  });
});

describe('buildPraiseFastPath', () => {
  const LOCALES: Locale[] = ['de', 'en', 'fr', 'es', 'it'];
  const BANNED_ABILITY_WORDS = [
    'smart',
    'klug',
    'klever',
    'clever',
    'genie',
    'génie',
    'genio',
    'talent',
    'talento',
    'intelligent',
    'gifted',
    'dotato',
    'dotado',
    'inteligente',
    'inteligente',
  ];

  it('produces a non-empty text for every kind, every locale', () => {
    const kinds = [
      classifyPraise({ ...baseInput, itemDifficulty: 1 }),
      classifyPraise({ ...baseInput, itemDifficulty: 4 }),
      classifyPraise({ ...baseInput, hintsUsed: 2 }),
      classifyPraise({ ...baseInput, priorWrongAttemptsOnItem: 1 }),
      classifyPraise({
        ...baseInput,
        itemAnswerKind: 'short',
        itemDifficulty: 3,
        learnerTextWordCount: 12,
      }),
    ];
    for (const locale of LOCALES) {
      for (const p of kinds) {
        const text = buildPraiseFastPath(p, locale, `${locale}-${p.kind}-x`);
        expect(text.length).toBeGreaterThan(0);
      }
    }
  });

  it('NEVER produces ability-praise vocabulary in any locale or kind', () => {
    const kinds = [
      classifyPraise({ ...baseInput, itemDifficulty: 1 }),
      classifyPraise({ ...baseInput, itemDifficulty: 4 }),
      classifyPraise({ ...baseInput, hintsUsed: 2 }),
      classifyPraise({ ...baseInput, priorWrongAttemptsOnItem: 1 }),
      classifyPraise({
        ...baseInput,
        itemAnswerKind: 'short',
        itemDifficulty: 3,
        learnerTextWordCount: 12,
      }),
    ];
    for (const locale of LOCALES) {
      for (const p of kinds) {
        // try all rotation seeds (probe the full variant table)
        for (let seed = 0; seed < 20; seed++) {
          const text = buildPraiseFastPath(p, locale, `seed-${seed}`).toLowerCase();
          for (const banned of BANNED_ABILITY_WORDS) {
            expect(
              text.includes(banned),
              `praise "${text}" (${locale}/${p.kind}/seed-${seed}) contains banned ability word "${banned}"`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('appends topic suffix on first_try_hard when topic is present', () => {
    const p = classifyPraise({
      ...baseInput,
      itemDifficulty: 4,
      itemTopic: 'Erwartungswert',
    });
    const text = buildPraiseFastPath(p, 'de', 'fixed-seed');
    expect(text).toMatch(/Erwartungswert/);
  });

  it('does NOT append topic suffix when topic is "—" or empty', () => {
    const placeholder = classifyPraise({
      ...baseInput,
      itemDifficulty: 4,
      itemTopic: '—',
    });
    const empty = classifyPraise({
      ...baseInput,
      itemDifficulty: 4,
      itemTopic: '',
    });
    // The suffix is "Bei „TOPIC" hast du …". Assert neither phrase appears.
    expect(buildPraiseFastPath(placeholder, 'de', 'fixed-seed')).not.toMatch(/Bei .„—/);
    expect(buildPraiseFastPath(empty, 'de', 'fixed-seed')).not.toMatch(/Bei .„/);
  });

  it('produces different variants on different seeds (variety)', () => {
    const p = classifyPraise({ ...baseInput, itemDifficulty: 4, itemTopic: null });
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      seen.add(buildPraiseFastPath(p, 'de', `seed-${seed}`));
    }
    // Should hit at least 2 different variants across 30 seeds.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is deterministic for a given (praise, locale, seed)', () => {
    const p = classifyPraise({ ...baseInput, itemDifficulty: 4 });
    const a = buildPraiseFastPath(p, 'de', 'seed-42');
    const b = buildPraiseFastPath(p, 'de', 'seed-42');
    expect(a).toBe(b);
  });
});

describe('buildPraiseRubricFragment', () => {
  it('always starts with the rubric header', () => {
    const cases = [
      classifyPraise({ ...baseInput }),
      classifyPraise({ ...baseInput, itemDifficulty: 4 }),
      classifyPraise({ ...baseInput, hintsUsed: 2 }),
      classifyPraise({ ...baseInput, priorWrongAttemptsOnItem: 1 }),
      classifyPraise({
        ...baseInput,
        itemAnswerKind: 'short',
        itemDifficulty: 3,
        learnerTextWordCount: 12,
      }),
    ];
    for (const p of cases) {
      expect(buildPraiseRubricFragment(p)).toMatch(/^— Praise rubric/);
    }
  });

  it('first_try_hard rubric explicitly forbids ability words', () => {
    const p = classifyPraise({ ...baseInput, itemDifficulty: 4, itemTopic: 'X' });
    const r = buildPraiseRubricFragment(p);
    expect(r.toLowerCase()).toMatch(/smart|klug|klever|talent/);
    expect(r).toMatch(/Never say/);
  });

  it('effort_after_hints rubric mentions the hint count', () => {
    const p = classifyPraise({ ...baseInput, hintsUsed: 2 });
    const r = buildPraiseRubricFragment(p);
    expect(r).toMatch(/2 hint/);
  });

  it('self_corrected rubric mentions prior attempt count', () => {
    const p = classifyPraise({ ...baseInput, priorWrongAttemptsOnItem: 3 });
    const r = buildPraiseRubricFragment(p);
    expect(r).toMatch(/3 wrong attempt/);
  });
});
