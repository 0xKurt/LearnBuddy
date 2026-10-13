// One bar per practice screen, and that bar is the one Composer (issue #395, report #388 §9 "Eine
// Leiste für jede Übung"; issue #599, owner rule 7). Read from the source, like
// `oneInput.test.ts` and the answer shell's test:
//
//   · every pinned bar (`<BottomBar>`) in a practice file holds the Composer, and holds it once —
//     "Prüfen" is its action, as "Senden" is the chat's;
//   · no bar stands inside another, and the answer shell renders one bar;
//   · the practice adapter (`CheckBar.tsx`) draws no bar of its own: one `<BottomBar>`, and what
//     it hands the Composer is an action for its one primary slot — never a button it built;
//   · the bars that are not an input at all (the end of a round, the pronunciation recorder) are
//     listed below. The list only shrinks: an entry whose file no longer needs it fails too, so
//     it is pulled down in the change that moves it.
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
const source = (name: string) => sources.find((s) => s.name === name)!.text;

/** Every `<BottomBar …>…</BottomBar>` of a file, as written. */
function bars(text: string): string[] {
  const out: string[] = [];
  for (const open of text.matchAll(/<BottomBar\b/g)) {
    const end = text.indexOf('</BottomBar>', open.index);
    out.push(text.slice(open.index, end === -1 ? undefined : end));
  }
  return out;
}

/** The Composer in a bar: itself, or through the adapter's two faces of it. */
const COMPOSER = /<(?:Composer|TypedComposer|AskComposer)\b/g;

/** The bars that are not an input: how many each file has, and why. Only shrinks. */
const OWN_BAR: Record<string, { count: number; why: string }> = {
  'SpeakPanel.tsx': { count: 1, why: 'pronunciation: the recorder — #388 step 6' },
  'CardPass.tsx': { count: 1, why: 'the end of a pass: "Zurück zu Buddy", not an answer (#384)' },
  'DrillRound.tsx': { count: 1, why: 'the end of a round: "Zurück zu Buddy", "Noch eine Runde"' },
  'RunResult.tsx': { count: 1, why: 'the end of a round: "Weiter", not an answer' },
};

describe('one bar per practice screen, and it is the Composer (#395, #599)', () => {
  it('puts the Composer in every bar but the listed ones', () => {
    const own: Record<string, number> = {};
    for (const { name, text } of sources) {
      if (name === 'BottomBar.tsx') continue;
      for (const bar of bars(text)) {
        const inputs = bar.match(COMPOSER)?.length ?? 0;
        // The adapter's one bar names the Composer's two faces (her answer, her question);
        // every other bar holds it once, never two.
        if (name !== 'CheckBar.tsx')
          expect(inputs, `${name}: one Composer in a bar, never two`).toBeLessThanOrEqual(1);
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

  it('renders the Composer itself in two practice files only: the adapter and Kopfrechnen', () => {
    const users = sources
      .filter((s) => /<Composer\b/.test(s.text))
      .map((s) => s.name)
      .sort();
    expect(users).toEqual(['CheckBar.tsx', 'DrillRound.tsx']);
    // Kopfrechnen: one Composer, in its one input bar.
    expect(source('DrillRound.tsx').match(/<Composer\b/g)).toHaveLength(1);
  });

  it('keeps the adapter thin: one bar, and the Composer in it', () => {
    const text = source('CheckBar.tsx');
    // One pinned bar, written once — the conversation row (`VoiceRow`, #386, not in the design)
    // stands in the Composer's place inside it, never in a bar of its own.
    expect(bars(text)).toHaveLength(1);
    expect(bars(text)[0]!).toMatch(/<TalkRow\b/);
    expect(bars(text)[0]!.match(COMPOSER)).toHaveLength(2);
    // The adapter builds no control for the bar: no round button, no key, no chip of its own.
    for (const built of ['CircleBtn', 'IconBtn', 'TalkButton', 'Chip', 'KeyRow', 'LbTextInput'])
      expect(text, `CheckBar.tsx builds a ${built}`).not.toMatch(new RegExp(`<${built}\\b`));
    // Its one `<Btn>` is the essay sheet's footer, which is not the bar.
    expect(text.match(/<Btn\b/g)).toHaveLength(1);
    expect(text).toMatch(/function SheetCheck\([\s\S]*<Btn\b/);
  });

  it('gives "Prüfen" and "Weiter" to the Composer’s one primary slot, as actions', () => {
    const text = source('CheckBar.tsx');
    expect(text).toMatch(/kind: 'check'/);
    expect(text).toMatch(/kind: 'next'/);
    expect(text).toMatch(/kind: 'send'/);
    // The parallel slots are gone (#599): no control beside, above or across the box.
    for (const { name, text: file } of sources)
      for (const slot of ['after', 'above', 'aboveYields', 'across', 'inBar', 'primary'])
        expect(file, `${name} fills a \`${slot}\` slot`).not.toMatch(
          new RegExp(`(?:^|[\\s{(,])${slot}=\\{`, 'm'),
        );
    for (const { name, text: file } of sources)
      expect(file, `${name}: "Prüfen" across`).not.toMatch(/place=["']across["']|checkAcross/);
    // Each mutually exclusive layout of the shell renders its action once.
    const shell = source('AnswerShell.tsx');
    const [measured, ordinary] = shell.split('function OrdinaryBody(');
    expect(ordinary).toBeDefined();
    expect(measured).toMatch(
      /if \(flow\.question !== undefined && flow\.question !== null\) \{\s*return <OrdinaryBody/,
    );
    expect(measured!.match(/<CheckBar\b/g)?.length ?? 0).toBe(1);
    expect(ordinary!.match(/<CheckBar\b/g)?.length ?? 0).toBe(1);
  });
});
