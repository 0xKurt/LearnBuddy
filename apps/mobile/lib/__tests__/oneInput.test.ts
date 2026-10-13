// One text field, one Composer (issue #365, owner 04.10.: "Es sollte EIN Inputfeld in der ganzen
// App existieren, das immer benutzt wird."; issue #599, owner rule 7: "The input bar is the ONE
// Composer"). Read from the source, like the answer shell's test: that no file but
// `LbTextInput.tsx` renders React Native's TextInput is the lint guard's job
// (`lb/one-text-field`, docs/engineering-guards.md); this one holds the Composer:
//
//   · the chat, every practice form (through the practice adapter) and Kopfrechnen render the
//     same `components/lb/Composer.tsx` — there is no second bar component (`InputBar` is gone);
//   · the box (`variant="bar"`) is drawn by the Composer alone — no screen builds a lookalike
//     from the field;
//   · the Composer has ONE primary slot (`action`): the parallel slots of before (`after`,
//     `above`, `across`, a free `primary` node) do not come back;
//   · digits come from the phone's number pad (owner rule 8), never from a text keyboard.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
const source = (file: string) => app.find((s) => s.file === file)!.text;

describe('one Composer for the chat and every practice (#365, #599)', () => {
  it('is what the chat, every practice form and Kopfrechnen type into', () => {
    const users = app
      .filter((s) =>
        /^import \{[^}]*\bComposer\b[^}]*\} from '[^']*\/lb\/Composer\.js';/ms.test(s.text),
      )
      .map((s) => s.file)
      .sort();
    expect(users).toEqual([
      'components/buddy/Composer.tsx',
      // The practice adapter: a typed answer's field, or her question on every other form.
      'components/practice/CheckBar.tsx',
      'components/practice/DrillRound.tsx',
    ]);
  });

  it('has no second bar component', () => {
    expect(existsSync(join(ROOT, 'components/lb/InputBar.tsx'))).toBe(false);
    expect(app.filter((s) => /\bInputBar\b/.test(s.text)).map((s) => s.file)).toEqual([]);
  });

  it('draws the box itself: no other file asks the field for it', () => {
    expect(app.filter((s) => /variant="bar"/.test(s.text)).map((s) => s.file)).toEqual([
      'components/lb/Composer.tsx',
    ]);
  });

  it('has one primary slot: `action`, and none of the parallel slots of before', () => {
    const text = source('components/lb/Composer.tsx');
    expect(text).toMatch(/^ {2}action\?: ComposerAction \| null;/m);
    expect(text.match(/testID="composer-primary"/g)).toHaveLength(1);
    for (const slot of [
      'after',
      'above',
      'aboveYields',
      'across',
      'primary',
      'microphone',
      'before',
    ])
      expect(text, `the Composer declares a \`${slot}\` prop`).not.toMatch(
        new RegExp(`^\\s+${slot}\\??:`, 'm'),
      );
    // What the slot can hold is a closed list; a control of a screen's own is `own`, by name.
    expect([...text.matchAll(/\{\s*kind: '([a-z]+)'/g)].map((m) => m[1])).toEqual([
      'send',
      'check',
      'next',
      'own',
    ]);
    // "Prüfen" and "Weiter" carry their sign (design components/composer/Composer.jsx:6).
    expect(text).toMatch(/label=\{t\('practice:next'\)\}\s+icon="arrow"/);
    expect(text).toMatch(/label=\{t\('practice:check'\)\}\s+icon="check"/);
    // The conversation button stands in the slot and nowhere else.
    expect(text.match(/<TalkButton\b/g)).toHaveLength(1);
    expect(text.slice(text.indexOf('function Primary('))).toMatch(/<TalkButton\b/);
  });
});

describe('digits come from the phone’s number pad (owner rule 8, #599)', () => {
  const practice = app.filter((s) => s.file.startsWith('components/practice/'));

  it('asks for the number pad wherever the answer is digits only', () => {
    for (const file of [
      'components/practice/DrillRound.tsx',
      'components/practice/ColumnAnswer.tsx',
    ]) {
      expect(source(file), file).toMatch(/keyboardType="number-pad"\s+inputMode="numeric"/);
    }
    // A table's whole-number gap: the pad; any other gap keeps the keyboard that has its signs.
    const table = source('components/practice/TableAnswer.tsx');
    expect(table).toMatch(/const pad = math && cell\.whole;/);
    expect(table).toMatch(/pad\s*\?\s*'number-pad'/);
    expect(table).toMatch(/pad \? \{ inputMode: 'numeric' as const \}/);
  });

  it('never asks for the decimal keyboard that only looks like one', () => {
    expect(
      practice.filter((s) => /keyboardType="numeric"/.test(s.text)).map((s) => s.file),
    ).toEqual([]);
  });
});
