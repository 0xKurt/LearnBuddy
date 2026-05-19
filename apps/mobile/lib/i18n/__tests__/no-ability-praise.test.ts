// Locale lint — Phase A1.
//
// Dweck's growth-mindset research shows that ability praise ("you're
// smart", "du bist klug", "talented") creates fragility: learners stop
// attempting things they fear they won't be praised for. Effort,
// strategy, and content-specific praise don't have the same effect.
//
// This test scans every locale JSON file in apps/mobile/locales/ for
// ability-praise vocabulary and fails the build if any slips in. It
// catches accidental copy mistakes in future PRs.
//
// Banned roots are matched case-insensitively against the JSON values.
// They include German/English/French/Spanish/Italian forms because all
// five locales ship.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Words/word-roots that signal ability-attribution praise. These fail
// the lint everywhere they appear in a locale value.
const BANNED_ABILITY_ROOTS = [
  'smart',
  'klug',
  'klever',
  'clever',
  'genie',
  'génie',
  'genio',
  'talent',
  'talento',
  'gifted',
  'dotato',
  'dotada',
  'dotado',
  'intelligenz', // ability noun in DE; "intelligente" / "intelligent" are
  // borderline since they can describe an answer, but the
  // safest rule is "say what the kid did, not what they are"
];

const LOCALES_DIR = join(__dirname, '..', '..', '..', 'locales');

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walk(value: unknown, path: string[] = []): Array<{ path: string[]; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => walk(v, [...path, String(i)]));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      walk(v, [...path, k]),
    );
  }
  return [];
}

describe('locale lint — no ability-attribution praise', () => {
  const localeDirs = readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const locale of localeDirs) {
    const files = readdirSync(join(LOCALES_DIR, locale)).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      it(`${locale}/${file} contains no ability-praise vocabulary`, () => {
        const json = readJson(join(LOCALES_DIR, locale, file));
        const strings = walk(json);
        const offenders: string[] = [];
        for (const { path, text } of strings) {
          const lower = text.toLowerCase();
          for (const root of BANNED_ABILITY_ROOTS) {
            if (lower.includes(root)) {
              offenders.push(`${path.join('.')} = ${JSON.stringify(text)} (banned: "${root}")`);
            }
          }
        }
        expect(
          offenders,
          `${locale}/${file}: ${offenders.length} ability-praise hit(s):\n  ${offenders.join('\n  ')}`,
        ).toEqual([]);
      });
    }
  }
});
