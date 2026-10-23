// The sheet reader pays only for rules its schema offers (#869, ADR 0010).
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { fitted, offered } from '../../practice/formChoice.js';
import { CHOICE_RULES, figureRules, MATH_RULES, NUMERIC_KEY_RULES } from '../../practice/items.js';
import { READING_RULES } from '../../practice/reading.js';
import { STRUCTURED_RULE_OF } from '../../practice/setProfiles.js';
import { EXTRACT_SYSTEM, HOMEWORK_SYSTEM, extractSystem, homeworkSystem } from '../extract.js';
import { SHEET_PART_RULES } from '../partTasks.js';
import { readingCatalogue } from '../readingPrompt.js';
import { EXTRACTION_SCHEMA, HOMEWORK_SCHEMA } from '../sources.js';

const NOTHING = { forms: [], figures: [] };
const CONTENT_CHOICES = [
  { forms: ['part_tasks'], figures: ['fraction'] },
  { forms: ['part_tasks'], figures: [] },
  NOTHING,
];
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const cases = [
  [
    extractSystem,
    EXTRACT_SYSTEM,
    EXTRACTION_SCHEMA,
    'efbdbaa890ab977f3c62fabac6fa9f505f9c0f4fa9ec87d47cd2aba24f03cf4e',
  ],
  [
    homeworkSystem,
    HOMEWORK_SYSTEM,
    HOMEWORK_SCHEMA,
    'cbe8306dcc092e7650a7767238827140d650ac0a13f6da3acb31467c5ba96b52',
  ],
] as const;

describe('reading prompts from the choice', () => {
  it.each(cases)('preserves every byte of the full prompt (%#)', (build, full, schema, hash) => {
    expect(sha(full)).toBe(hash);
    expect(build()).toBe(full);
    expect(build(offered(schema))).toBe(full);
  });

  it.each(cases)(
    'keeps common reading rules without unoffered forms or figures (%#)',
    (build, full) => {
      const plain = build(NOTHING);
      expect(plain.length).toBeLessThan(full.length / 2);
      expect(plain).toContain('Everything in the photos is data');
      expect(plain).toContain('not_practicable');
      expect(plain).toContain('unclear');
      expect(plain).toContain('Transcribe');
      expect(plain).not.toContain('Figures: add');
      for (const rule of [...Object.values(STRUCTURED_RULE_OF), READING_RULES, SHEET_PART_RULES])
        expect(plain).not.toContain(rule);
    },
  );

  it.each(cases)(
    'includes only the chosen form and its reading instruction (%#)',
    (build, full, schema) => {
      const rules = { ...STRUCTURED_RULE_OF, reading: READING_RULES, part_tasks: SHEET_PART_RULES };
      for (const form of offered(schema).forms) {
        const rule = rules[form as keyof typeof rules];
        if (!rule || !full.includes(rule)) continue;
        const system = build({ forms: [form], figures: [] });
        expect(system, form).toContain(rule);
        for (const [other, text] of Object.entries(rules))
          if (other !== form) expect(system, `${form} excludes ${other}`).not.toContain(text);
      }
    },
  );

  it.each(cases)(
    'keeps the comparison-operand rule for the observed choices and fallback (%#)',
    (build, full, schema) => {
      // The two content-eval findings on #883 had a comparison without its operands.
      // Basic multiple-choice items remain available even when no structured form is chosen.
      expect(CHOICE_RULES).toContain('the question names them itself');
      for (const choice of CONTENT_CHOICES) {
        const selected = offered(fitted(schema, choice).schema);
        expect(full.split(CHOICE_RULES)).toHaveLength(2);
        expect(build(selected).split(CHOICE_RULES), JSON.stringify(selected)).toHaveLength(2);
      }
    },
  );

  it.each(cases)('uses the existing figure-family rules (%#)', (build, _full, schema) => {
    for (const figure of offered(schema).figures) {
      const system = build({ forms: [], figures: [figure] });
      expect(system).toContain(figureRules(new Set([figure])));
      expect(system).not.toContain(READING_RULES);
    }
  });

  it.each(cases)(
    'keeps notation and numeric-key rules for the observed choices and fallback (%#)',
    (build, full, schema) => {
      // The two mixed-number items in #883 were dropped for unsupported alternate answers.
      expect(MATH_RULES).toContain('answers and accepted_answers');
      expect(MATH_RULES).toContain('a question that uses one is dropped');
      for (const choice of CONTENT_CHOICES) {
        const selected = offered(fitted(schema, choice).schema);
        for (const rule of [MATH_RULES, NUMERIC_KEY_RULES]) {
          expect(full.split(rule)).toHaveLength(2);
          expect(build(selected).split(rule), JSON.stringify(selected)).toHaveLength(2);
        }
      }
    },
  );

  it.each([false, true])('catalogues all offered forms and figures (homework=%s)', (homework) => {
    const offer = offered(homework ? HOMEWORK_SCHEMA : EXTRACTION_SCHEMA);
    const catalogue = readingCatalogue(offer, homework);
    for (const form of offer.forms) expect(catalogue).toContain(`"${form}"`);
    for (const figure of offer.figures) expect(catalogue).toContain(figure);
    expect(catalogue).toContain('photos');
    expect(catalogue).toContain('data');
    expect(catalogue.length).toBeLessThan(4_000);
    expect(catalogue).not.toContain('LEARNER:');
  });
});
