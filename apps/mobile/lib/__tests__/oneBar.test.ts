// One bar per practice screen, and that bar is the input bar (issue #395, report #388 §9 "Eine
// Leiste für jede Übung"). Read from the source, like `oneInput.test.ts` and the answer shell's
// test:
//
//   · every pinned bar (`<BottomBar>`) in a practice file holds the one input bar (`InputBar`), and
//     holds it once — "Prüfen" is its action, as "Senden" is the chat's;
//   · no bar stands inside another, and the answer shell renders one bar;
//   · the bars that do not hold the input bar yet are listed below with the step that moves them.
//     The list only shrinks: an entry whose file no longer needs it fails too, so it is pulled
//     down in the change that moves it.
//
// What this cannot see is how many bars a screen shows at once; the walkthrough counts them at
// every stop (`tests/web/fit.ts`, `room`: one bar).

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRACTICE = join(__dirname, '../../components/practice');
const SCREEN = join(__dirname, '../../app/practice');

const sources = [PRACTICE, SCREEN].flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ name: basename(f), text: readFileSync(join(dir, f), 'utf8') })),
);

/** Every `<BottomBar …>…</BottomBar>` of a file, as written. */
function bars(text: string): string[] {
  const out: string[] = [];
  for (const open of text.matchAll(/<BottomBar\b/g)) {
    const end = text.indexOf('</BottomBar>', open.index);
    out.push(text.slice(open.index, end === -1 ? undefined : end));
  }
  return out;
}

/**
 * The bars that are not the input bar yet: how many each file has, and the step that moves them
 * (report #388 §9, "Order"). Only shrinks.
 */
const OWN_BAR: Record<string, { count: number; why: string }> = {
  'CheckBar.tsx': {
    count: 1,
    why: 'options she taps, in voice mode: the spoken answer’s slot — #386 part 2 builds the voice row',
  },
  '[id].tsx': { count: 1, why: '"Weiter" once a question is closed — #388 step 6' },
  'SpeakPanel.tsx': { count: 1, why: 'pronunciation: the recorder — #388 step 6' },
  'CardPass.tsx': { count: 1, why: 'the end of a pass: "Zurück zu Buddy", not an answer (#384)' },
  'DrillRound.tsx': { count: 2, why: 'Kopfrechnen: its own digit pad and "Prüfen" — #388 step 6' },
  'RunResult.tsx': { count: 1, why: 'the end of a round: "Weiter", not an answer' },
};

describe('one bar per practice screen, and it is the input bar (#395)', () => {
  it('puts the input bar, once, in every bar but the listed ones', () => {
    const own: Record<string, number> = {};
    for (const { name, text } of sources) {
      if (name === 'BottomBar.tsx') continue;
      for (const bar of bars(text)) {
        const inputs = bar.match(/<InputBar\b/g)?.length ?? 0;
        expect(inputs, `${name}: one input bar in a bar, never two`).toBeLessThanOrEqual(1);
        if (inputs === 0) own[name] = (own[name] ?? 0) + 1;
      }
    }
    expect(own).toEqual(Object.fromEntries(Object.entries(OWN_BAR).map(([k, v]) => [k, v.count])));
  });

  it('never stands a bar inside another', () => {
    for (const { name, text } of sources)
      for (const bar of bars(text))
        expect(bar.slice(1).includes('<BottomBar'), `${name}: a bar inside a bar`).toBe(false);
  });

  it('gives "Prüfen" to the input bar: the shell’s action renders it as the bar’s action', () => {
    const { text } = sources.find((s) => s.name === 'CheckBar.tsx')!;
    // The bar of a form with a check action: the input bar with her question's field (#402), and
    // "Prüfen" in its action slot.
    expect(text).toMatch(/useAskField\(\s*<CheckBtn\b/);
    // The shell renders its action once.
    const shell = sources.find((s) => s.name === 'AnswerShell.tsx')!.text;
    expect(shell.match(/<CheckBar\b/g)?.length ?? 0).toBe(1);
  });
});
