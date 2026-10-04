// One text field, one input bar (issue #365, owner 04.10.: "Es sollte EIN Inputfeld in der
// ganzen App existieren, das immer benutzt wird."). Read from the source, like the answer shell's
// test: that no file but `LbTextInput.tsx` renders React Native's TextInput is the lint guard's job
// (`lb/one-text-field`, docs/engineering-guards.md); this one holds the bar:
//
//   · the chat's composer and a practice answer type into the same `InputBar`;
//   · the bar's pill (`variant="bar"`) is drawn by `InputBar` alone — no screen builds a
//     lookalike from the field.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

function sources(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name)
      ? [{ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];

describe('one input bar for the chat and every typed answer (#365)', () => {
  it('is what the chat and a practice answer type into', () => {
    const users = app
      .filter((s) => /^import \{[^}]*\bInputBar\b[^}]*\} from '[^']*\/InputBar\.js';/m.test(s.text))
      .map((s) => s.file)
      .sort();
    expect(users).toEqual([
      'components/buddy/Composer.tsx',
      // A board's bar: the input bar without its field, "Prüfen" its action (#395).
      'components/practice/CheckBar.tsx',
      'components/practice/TypedAnswer.tsx',
    ]);
  });

  it('draws the pill itself: no other file asks the field for it', () => {
    expect(app.filter((s) => /variant="bar"/.test(s.text)).map((s) => s.file)).toEqual([
      'components/lb/InputBar.tsx',
    ]);
  });
});
