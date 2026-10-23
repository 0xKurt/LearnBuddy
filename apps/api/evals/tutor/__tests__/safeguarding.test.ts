import { describe, expect, it } from 'vitest';

import { SAFEGUARDING_CASES } from '../safeguardingCorpus.js';
import { SAFEGUARDING_CONTROLS } from '../safeguardingControls.js';
import { comparisonPlan, summarize, type Measurement } from '../safeguardingCompare.js';

describe('shared distress eval (#879)', () => {
  it('has at least 30 non-distress controls, covering all five languages', () => {
    const controls = SAFEGUARDING_CASES.filter((c) => !c.concern);
    expect(controls.length).toBeGreaterThanOrEqual(30);
    for (const locale of ['de', 'en', 'fr', 'es', 'it']) {
      expect(controls.filter((c) => c.locale === locale).length, locale).toBeGreaterThanOrEqual(6);
    }
  });

  it('preserves all 23 true-distress cases and unique case ids', () => {
    expect(SAFEGUARDING_CASES.filter((c) => c.concern)).toHaveLength(23);
    expect(new Set(SAFEGUARDING_CASES.map((c) => c.id)).size).toBe(SAFEGUARDING_CASES.length);
  });

  it('covers the requested boundaries and all callers in every language', () => {
    for (const locale of ['de', 'en', 'fr', 'es', 'it']) {
      const controls = SAFEGUARDING_CONTROLS.filter((c) => c.locale === locale);
      expect(new Set(controls.map((c) => c.category))).toEqual(
        new Set([
          'frustration',
          'joke',
          'insult',
          'nerves',
          'war',
          'death_poem',
          'sad_story',
          'fictional_danger',
        ]),
      );
      expect(new Set(controls.map((c) => c.surface))).toEqual(
        new Set(['practice', 'chat', 'roleplay']),
      );
      for (const c of controls) {
        expect(c.concern).toBe(false);
        expect(c.says.trim().length).toBeGreaterThan(0);
        expect(Boolean(c.question), c.id).toBe(c.surface === 'practice');
      }
    }
  });

  const plan = comparisonPlan(SAFEGUARDING_CASES);
  const clearRun = (): Measurement[] =>
    plan.map((trial) => ({
      ...trial,
      finding: trial.c.concern ? 'concern' : 'clear',
      pathValid: true,
    }));

  it('pairs the same controls on both models, reverses order, and runs true cases only once', () => {
    const controls = SAFEGUARDING_CASES.filter((c) => !c.concern);
    for (const [i, c] of controls.entries()) {
      const pair = plan.slice(i * 2, i * 2 + 2);
      expect(pair.map((t) => t.c)).toEqual([c, c]);
      expect(pair.map((t) => t.tier)).toEqual(i % 2 ? ['smart', 'fast'] : ['fast', 'smart']);
    }
    expect(plan.filter((t) => t.c.concern)).toEqual(
      SAFEGUARDING_CASES.filter((c) => c.concern).map((c) => ({ c, tier: 'fast' })),
    );
  });

  it('keeps fast only if its false alarms are no worse and every true case is found', () => {
    const rows = clearRun();
    expect(summarize(rows, plan).keepFast).toBe(true);
    rows[0]!.finding = 'concern';
    expect(summarize(rows, plan).keepFast).toBe(false);
    rows[1]!.finding = 'concern';
    expect(summarize(rows, plan).keepFast).toBe(true);
    rows.find((r) => r.c.concern)!.finding = 'clear';
    expect(summarize(rows, plan).keepFast).toBe(false);
  });

  it('counts provider blocks as help alarms and exposes unavailable checks separately', () => {
    const rows = clearRun();
    rows[0]!.finding = 'blocked';
    rows[1]!.finding = 'unchecked';
    const report = summarize(rows, plan);
    expect(report.controls.fast).toMatchObject({ help: 1, concern: 0, blocked: 1, unchecked: 0 });
    expect(report.controls.smart).toMatchObject({ help: 1, concern: 0, blocked: 0, unchecked: 1 });
    expect(report.keepFast).toBe(false);
  });

  it('cannot approve an incomplete, duplicated or broken endpoint run', () => {
    const rows = clearRun();
    expect(summarize(rows.slice(1), plan).keepFast).toBe(false);
    expect(summarize([rows[1]!, ...rows.slice(1)], plan).keepFast).toBe(false);
    rows[0]!.pathValid = false;
    expect(summarize(rows, plan).keepFast).toBe(false);
  });
});
