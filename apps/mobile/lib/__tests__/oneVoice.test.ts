// One control per voice function (issue #386, CLAUDE.md rule 19; owner 04.10.: "simplicity ist
// unser oberstes Gebot und du erfindest neue icons, neue wege wie man so einen Modus ein und
// ausschaltet"). Read from the source, like `oneInput.test.ts`:
//
//   · Vorlesen is switched by one component, the speaker in the header (`ReadAloudSwitch`), and
//     the chat's head and the practice head both render it;
//   · Gespräch is entered by the waveform (`TalkButton`) at the end of the input bar — in the chat
//     and in practice — and its controls are one row (`VoiceRow`), the conversation screen's;
//   · what #386 removed stays removed: the headphones, the practice's own switch, "Frage vorlesen"
//     in the card, the "Nochmal vorlesen" pill, the chat's voice-first bar.

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

const app = [
  ...sources(join(ROOT, 'app')),
  ...sources(join(ROOT, 'components')),
  ...sources(join(ROOT, 'lib')),
];
const holders = (pattern: RegExp) =>
  app
    .filter((s) => pattern.test(s.text))
    .map((s) => s.file)
    .sort();

describe('Vorlesen: one switch, the same in the chat and in practice (#386)', () => {
  it('is switched only by the speaker switch', () => {
    expect(holders(/\bsetReadAloud\(/)).toEqual(['components/lb/ReadAloudSwitch.tsx']);
  });

  it('stands in the chat’s head and in the practice head', () => {
    expect(holders(/<ReadAloudSwitch\b/)).toEqual([
      'app/practice/[id].tsx',
      'components/buddy/Header.tsx',
    ]);
  });
});

describe('Gespräch: one way in, one row of controls (#386)', () => {
  it('is entered by the waveform at the end of the input bar, in the chat and in practice', () => {
    expect(holders(/<TalkButton\b/)).toEqual([
      'components/buddy/Composer.tsx',
      // Options she can say (the bar holds her question) and a typed answer.
      'components/practice/CheckBar.tsx',
      'components/practice/TypedAnswer.tsx',
    ]);
  });

  it('is started and ended in one place — and carried on from the conversation screen', () => {
    expect(holders(/\bsetConversation\(/)).toEqual([
      // An offer tapped while talking: the practice goes on as a conversation (issue #40).
      'components/learn/OfferCard.tsx',
      'components/voice/useConversation.ts',
    ]);
  });

  it('has one row: the big mic in the middle, the same on the conversation screen and in practice', () => {
    expect(holders(/<VoiceRow\b/)).toEqual(['app/talk.tsx', 'components/practice/CheckBar.tsx']);
    // The big mic stands nowhere else (the chat's voice-first bar and the practice voice slot).
    expect(holders(/<MicButton\b[^>]*size="lg"/)).toEqual([
      'app/talk.tsx',
      'components/practice/CheckBar.tsx',
    ]);
  });
});

describe('what #386 removed stays removed', () => {
  it('has no headphones and no second switch', () => {
    expect(holders(/['"]headphones['"]/)).toEqual([]);
    for (const gone of [
      'components/voice/VoiceModeToggle.tsx',
      'components/practice/ReadQuestionButton.tsx',
    ])
      expect(existsSync(join(ROOT, gone)), gone).toBe(false);
  });

  it('reads the question again only from the conversation row, never from a pill', () => {
    expect(holders(/voice\.read_again/)).toEqual(['components/practice/CheckBar.tsx']);
  });
});
