// An answer in another unit of the same quantity (issue #227 A6), as rows in the manner of the
// grading truth table in evaluate.test.ts: a different amount is wrong without the tutor; the
// same amount is right in value and its unit is the tutor's (D-3) — never 'correct' by rule, the
// question may have been "in cm".
import { describe, expect, it } from 'vitest';

import { ruleCheck, type ItemForCheck, type RuleVerdict } from '../evaluate.js';

const numeric = (answer: string, unit: string): ItemForCheck => ({
  kind: 'numeric',
  answer,
  accepted_answers: [],
  unit,
  choices: null,
  correct_choice: null,
  tolerance: null,
  spelling: null,
  subject_kind: null,
});

const ROWS: Array<[key: string, unit: string, text: string, expect: RuleVerdict]> = [
  ['150', 'cm', '1,4 m', 'incorrect'],
  ['150', 'cm', '1,5 m', 'other_form'],
  ['150', 'cm', '1500 mm', 'other_form'],
  ['1.5', 'h', '90 min', 'other_form'],
  ['1.5', 'h', '80 min', 'incorrect'],
  ['2.5', 'kg', '2050 g', 'incorrect'],
  ['1', 'l', '1000 cm³', 'other_form'],
  ['36', 'km/h', '10 m/s', 'other_form'],
  ['0.5', '€', '50 ct', 'other_form'],
  ['0.5', '€', '40 ct', 'incorrect'],
  // The units a phone types, in the key's own unit: decided like any number.
  ['24', 'cm²', '24 cm2', 'correct'],
  ['90', '°', '90°', 'correct'],
  ['90', '°', '80°', 'incorrect'],
  ['12', 'N', '12 N', 'correct'],
  // Another quantity, or no conversion that is a pure factor: still the tutor's.
  ['5', 'min', '5 m', 'unknown'],
  ['20', '°C', '293 K', 'unknown'],
  // A calculation stays the tutor's in any unit (audit H-1).
  ['150', 'cm', '1,5·1 m', 'unknown'],
];

describe('another unit of the same quantity (#227 A6)', () => {
  for (const [key, unit, text, expected] of ROWS) {
    it(`key ${key} ${unit} ← ${JSON.stringify(text)} is ${expected}`, () => {
      expect(ruleCheck(numeric(key, unit), { text, choice: null })).toBe(expected);
    });
  }
});
