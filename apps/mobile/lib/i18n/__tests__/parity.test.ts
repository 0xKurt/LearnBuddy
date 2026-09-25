// Every language has every key, with the same {{placeholders}} (CLAUDE.md:
// German default; English, French, Spanish, Italian must exist for all keys).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../locales');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

const namespaces = readdirSync(join(ROOT, 'de')).filter((f) => f.endsWith('.json'));

describe('locales', () => {
  it.each(namespaces)('%s: every language has the German keys and placeholders', (file) => {
    const de = flatten(JSON.parse(readFileSync(join(ROOT, 'de', file), 'utf8')) as Tree);
    expect(de.size).toBeGreaterThan(0);
    for (const lang of LANGS.slice(1)) {
      const other = flatten(JSON.parse(readFileSync(join(ROOT, lang, file), 'utf8')) as Tree);
      expect([...other.keys()].sort(), `${lang}/${file} keys`).toEqual([...de.keys()].sort());
      for (const [key, text] of de) {
        expect(placeholders(other.get(key) ?? ''), `${lang}/${file} ${key}`).toEqual(
          placeholders(text),
        );
        expect(
          (other.get(key) ?? '').trim().length,
          `${lang}/${file} ${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
