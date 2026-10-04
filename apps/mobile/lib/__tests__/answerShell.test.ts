// One place for an answer and its action (issue #310 §3.4, rule 0: what can be checked by code is
// checked by code). Read from the source, like the wiring test:
//
//   · a form in the answer shell brings nothing of the shell itself — no bar, no spacer, no
//     "Prüfen", no keyboard handling, no hand-built tile;
//   · the bar (`BottomBar`), the spacer (`FreeSpace`) and "Prüfen" have the owners listed below
//     and no others. The lists name what has not moved into the shell yet and the step that moves
//     it; they only shrink — an entry whose file no longer needs it fails too, so the list is
//     pulled down in the change that moves it.
//
// What this cannot see is where things end up on a phone; the walkthrough measures that at every
// stop (`tests/web/fit.ts`, `answerPlace`).

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRACTICE = join(__dirname, '../../components/practice');
const SCREEN = join(__dirname, '../../app/practice');
const MATH = join(__dirname, '../../components/math');

const sources = [PRACTICE, SCREEN].flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ name: basename(f), text: readFileSync(join(dir, f), 'utf8') })),
);

/** The modules a file imports from, by their last path part ("./BottomBar.js" → "BottomBar"). */
function imports(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/^import[^;]*?from '([^']+)';/gms)) {
    out.add(m[1]!.split('/').pop()!.replace(/\.js$/, ''));
  }
  return out;
}

/** The forms in the shell: they fill its slots and nothing else. */
const IN_SHELL = [
  'OrderAnswer.tsx',
  'MatchAnswer.tsx',
  'TableAnswer.tsx',
  'ClozeAnswer.tsx',
  'SelectAllAnswer.tsx',
  'MarkAnswer.tsx',
  'TypedAnswer.tsx',
  'StaffWriting.tsx',
];

/** Who renders the pinned bar, and why it is not (yet) the shell's "Prüfen". */
const BAR: Record<string, string> = {
  'CheckBar.tsx': 'the shell’s action',
  '[id].tsx': '"Weiter" once a question is closed, handed to the shell as its bar (`action.bar`)',
  'SpeakPanel.tsx': 'pronunciation: the recording is the action, handed to the shell as its bar',
  'CardPass.tsx': 'flash cards: a screen of their own, no answer to check',
  'DrillRound.tsx': 'Kopfrechnen: a timed round on its own digit pad (#243)',
  'RunResult.tsx': 'the end of a round: "Weiter", not an answer',
};

/** Who places the free room. */
const SPACER: Record<string, string> = {
  'AnswerShell.tsx': 'between the answer and "Prüfen" (or what stands in its place)',
};

/** Who writes "Prüfen" (the key `check`) on a button. */
const CHECK: Record<string, string> = {
  'CheckBar.tsx': 'the shell’s action',
  'DrillRound.tsx': 'Kopfrechnen’s pad (#243)',
};

/** Who draws with the shadow: never an answer form (its tiles are `AnswerTile`). */
const SHADOWED: Record<string, string> = {
  'ItemThread.tsx': 'a speech bubble of the conversation, not an answer',
  'SessionSummary.tsx': 'a card on the summary, not an answer',
};

/** What fills the shell's `keys` slot: each is the one key row with its own keys (step 4). */
const KEY_ROWS = ['MathKeys.tsx', 'StaffKeys.tsx'];

function holders(test: (s: { name: string; text: string }) => boolean): string[] {
  return sources
    .filter(test)
    .map((s) => s.name)
    .sort();
}

describe('the answer shell is the only place for an answer and its action (#310)', () => {
  it('has every form it lists in it', () => {
    for (const name of IN_SHELL) {
      const file = sources.find((s) => s.name === name);
      expect(file, name).toBeDefined();
      expect([...imports(file!.text)], name).toContain('AnswerShell');
    }
  });

  it('renders the pinned bar only through its listed owners', () => {
    expect(holders((s) => s.name !== 'BottomBar.tsx' && imports(s.text).has('BottomBar'))).toEqual(
      Object.keys(BAR).sort(),
    );
  });

  it('places the free room only through its listed owners', () => {
    // The spacer itself, not its report: the screen provides where the room is measured
    // (`FreeSpaceReport`), and only the shell places the room.
    const placesRoom = (text: string) => /^import\s*\{[^}]*\bFreeSpace\b[^}]*\}/m.test(text);
    expect(holders((s) => s.name !== 'FreeSpace.tsx' && placesRoom(s.text))).toEqual(
      Object.keys(SPACER).sort(),
    );
  });

  it('writes "Prüfen" only through its listed owners', () => {
    expect(holders((s) => /\bt\('(practice:)?check'\)/.test(s.text))).toEqual(
      Object.keys(CHECK).sort(),
    );
  });

  it('handles the keyboard once, in the screen (rule 15)', () => {
    expect(holders((s) => imports(s.text).has('KeyboardSafe'))).toEqual(['[id].tsx']);
  });

  it('draws no tile by hand: the shadow has its listed owners only', () => {
    expect(holders((s) => /\bSHADOW\b/.test(s.text))).toEqual(Object.keys(SHADOWED).sort());
  });

  it('keeps a form in the shell free of the shell’s parts', () => {
    for (const name of IN_SHELL) {
      const { text } = sources.find((s) => s.name === name)!;
      const from = imports(text);
      for (const part of ['BottomBar', 'FreeSpace', 'CheckBar', 'KeyboardSafe'])
        expect(from.has(part), `${name} imports ${part}`).toBe(false);
    }
  });

  it('has one key row: what fills the keys slot is `KeyRow`, and no form builds keys itself', () => {
    const withMath = [
      ...sources,
      ...readdirSync(MATH)
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => ({ name: basename(f), text: readFileSync(join(MATH, f), 'utf8') })),
    ];
    for (const name of KEY_ROWS) {
      const file = withMath.find((s) => s.name === name);
      expect(file, name).toBeDefined();
      expect([...imports(file!.text)], name).toContain('KeyRow');
    }
    // A row of keys is a toolbar or a choice of keys; the one key row draws it.
    expect(
      withMath
        .filter((s) => /accessibilityRole="(toolbar|radiogroup)"/.test(s.text))
        .map((s) => s.name),
    ).toEqual([]);
  });
});
