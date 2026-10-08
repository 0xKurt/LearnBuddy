// One listening hook on the practice screen (#311 part 6, issue #445): every "Anhören" — a word, a
// sentence, a drawn note line, the tones of an interval she names by ear — plays and stops through
// `useListenToggle`. Read from the source, like `oneVoice.test.ts`: no practice file plays a note
// line or words on its own, and no other file keeps its own play/stop state. Before #445 the note
// line had a copy of the hook (`useStaffPlay`).

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PRACTICE = join(__dirname, '../../components/practice');
const SCREEN = join(__dirname, '../../app/practice');

const sources = [PRACTICE, SCREEN].flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ name: basename(f), text: readFileSync(join(dir, f), 'utf8') })),
);
const holders = (pattern: RegExp) =>
  sources
    .filter((s) => pattern.test(s.text))
    .map((s) => s.name)
    .sort();

/**
 * Who else keeps a play state of their own, and why. Only shrinks.
 * `HearText`: the Hörtext is a server recording with passes and "langsamer" (issue #210).
 */
const OWN_STATE = ['HearText.tsx'];

describe('one listening hook (#445)', () => {
  it('plays a note line and words only in useListenToggle', () => {
    expect(holders(/\bplayLine\(/)).toEqual(['useListenToggle.ts']);
    expect(holders(/\bspeak\(/)).toEqual(['useListenToggle.ts']);
  });

  it('keeps the play/stop state in the hook, not in each control', () => {
    expect(holders(/\[playing, setPlaying\]/)).toEqual(['useListenToggle.ts', ...OWN_STATE].sort());
  });

  it('is what every listen control in practice uses', () => {
    for (const name of ['ListenButton.tsx', 'StaffPlayButton.tsx', 'StaffKeys.tsx'])
      expect(holders(/\buseListenToggle\(/), name).toContain(name);
  });
});
