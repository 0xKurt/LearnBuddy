// One listen control on the practice screen (#311 step 2, issue #445): every "Anhören" — a word, a
// sentence, a drawn note line, the tones of an interval she names by ear, the Hörtext and the
// Diktat — plays and stops through `useListen`, which keeps its state in the one `usePlayback`
// (lib/speech), and looks and speaks through the one `ListenButton`. Read from the source, like
// `oneVoice.test.ts`: no practice file plays a note line, words or a recording on its own, and no
// file keeps its own play/stop state. Before #445 the note line had a copy of the hook
// (`useStaffPlay`), before #311 slice 6 the Hörtext, before step 2 there were two hooks
// (`useListenToggle`, `useHearText`) and four buttons (`StaffPlayButton`, `HearText`, the Diktat's).

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

describe('one listen control (#311 step 2)', () => {
  it('plays a note line, words and a recording only in useListen', () => {
    expect(holders(/\bplayLine\(/)).toEqual(['useListen.ts']);
    expect(holders(/\bspeak\(/)).toEqual(['useListen.ts']);
    expect(holders(/\blistenToItem\(/)).toEqual(['useListen.ts']);
  });

  it('keeps the play/stop state in usePlayback, not in each control (#311)', () => {
    expect(holders(/\[playing, setPlaying\]/)).toEqual([]);
    expect(holders(/\busePlayback</)).toEqual(['useListen.ts']);
  });

  it('is one button; the staff keys are the only other user of the hook', () => {
    expect(holders(/= useListen\(/)).toEqual(['ListenButton.tsx', 'StaffKeys.tsx']);
    for (const name of [
      'CardPass.tsx',
      'DictationCard.tsx',
      'QuestionFigure.tsx',
      'QuestionThread.tsx',
      'QuestionTools.tsx',
      'SpeakPanel.tsx',
      'WordSheet.tsx',
    ])
      expect(holders(/<ListenButton\b/), name).toContain(name);
  });
});
