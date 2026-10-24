// One control per voice function (issue #386, CLAUDE.md rule 19; owner 04.10.: "simplicity ist
// unser oberstes Gebot und du erfindest neue icons, neue wege wie man so einen Modus ein und
// ausschaltet"). Read from the source, like `oneInput.test.ts`:
//
//   · Vorlesen is switched by one component, the speaker in the header (`ReadAloudSwitch`), and
//     the chat's head and the practice head both render it;
//   · Gespräch is entered by the blue waveform (`TalkButton`) in the Composer's primary slot — in
//     the chat and in practice — and its controls are one row (`VoiceRow`), the conversation
//     screen's;
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

  it('stands in the one head of every screen (#599)', () => {
    expect(holders(/<ReadAloudSwitch\b/)).toEqual([
      // The shared header draws the switch itself: the chat, practice and every other screen.
      'components/lb/BuddyHeader.tsx',
    ]);
  });

  it('is in the head of every practice: a question, a Kopfrechnen round, a card pass (#434)', () => {
    // Each of them stands in the one `Screen`, whose head draws the switch; none builds a right
    // end of its own (the card pass's `HeadActions` is gone, #599).
    const source = (file: string) => app.find((s) => s.file === file)!.text;
    for (const file of [
      'app/practice/[id].tsx',
      'components/practice/DrillRound.tsx',
      'components/practice/CardPass.tsx',
    ]) {
      expect(source(file), file).toMatch(/<Screen\b/);
      expect(source(file), file).not.toMatch(/\bsound=\{|\bright=\{/);
    }
    expect(holders(/\bHeadActions\b/)).toEqual([]);
    expect(existsSync(join(ROOT, 'components/practice/HeadActions.tsx'))).toBe(false);
  });

  it('is drawn exactly once by the shared header, whoever renders it', () => {
    const source = (file: string) => app.find((s) => s.file === file)!.text;
    expect(source('components/buddy/Header.tsx')).toMatch(/<BuddyHeader\b/);
    expect(source('app/practice/[id].tsx')).toMatch(/<Screen\b/);
    expect(source('components/lb/Screen.tsx')).toMatch(/<BuddyHeader\b/);
    // A caller's speaker is neither passed on nor drawn a second time.
    expect(source('components/lb/Screen.tsx')).not.toMatch(/sound=/);
    expect(source('components/lb/BuddyHeader.tsx').match(/<ReadAloudSwitch\b/g)).toHaveLength(1);
  });

  it('reads again with a tap on the question itself, wherever one is read (#434)', () => {
    expect(holders(/<ReadAgain\b/)).toEqual([
      'components/practice/CardPass.tsx',
      'components/practice/DrillRound.tsx',
      'components/practice/Question.tsx',
    ]);
  });
});

describe('Gespräch: one way in, one row of controls (#386)', () => {
  it('is entered by the waveform at the end of the input bar, in the chat and in practice', () => {
    // One place draws it: the Composer's primary slot (#599). A screen only says that a
    // conversation can start here (`onTalk`).
    expect(holders(/<TalkButton\b/)).toEqual(['components/lb/Composer.tsx']);
    expect(holders(/\bonTalk[=:]/)).toEqual([
      'app/buddy.tsx',
      'components/buddy/Composer.tsx',
      'components/lb/Composer.tsx',
      // Options she can say (the bar holds her question) and a typed answer.
      'components/practice/CheckBar.tsx',
      'components/practice/TypedAnswer.tsx',
    ]);
  });

  it('is the filled waveform and never a second, quieter one among the tools', () => {
    // The mark is drawn by the talk button — and by the role card of a roleplay, whose start
    // is the design's second way into the conversation (components/practice/Modes.jsx:23, :27).
    // No other file hands the waveform to a button or a tile of its own (the grey circle left
    // of "Prüfen", #599), whether as a prop or as an action's `icon`.
    expect(holders(/\bicon\s*[=:]\s*\{?\s*["']voice["']/)).toEqual([
      'components/buddy/RoleplayCard.tsx',
      'components/voice/TalkButton.tsx',
    ]);
    // Wherever the waveform stands, it leads to the conversation: the role card's opens the
    // conversation screen and nothing else, and only these two places open it at all.
    const card = app.find((s) => s.file === 'components/buddy/RoleplayCard.tsx')!.text;
    expect(
      card.match(/icon: 'voice',\s+fit: true,\s+onPress: \(\) => router\.push\('\/talk'\)/g),
    ).toHaveLength(1);
    expect(card.match(/router\.(push|replace|navigate)\(/g)).toHaveLength(1);
    expect(holders(/router\.(push|replace|navigate)\(\s*['"]\/talk['"]/)).toEqual([
      'app/buddy.tsx',
      'components/buddy/RoleplayCard.tsx',
    ]);
    const talk = app.find((s) => s.file === 'components/voice/TalkButton.tsx')!.text;
    expect(talk).toMatch(/icon="voice"\s+filled\s+size=\{COMPOSER\.slot\}/);
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
    // Dictation and audio assessment share the same mic control (#918).
    expect(holders(/<MicButton\b/)).toEqual([
      'components/buddy/RehearseCard.tsx',
      'components/lb/Composer.tsx',
      'components/learn/TopicSheet.tsx',
      'components/practice/PronunciationLab.tsx',
      'components/practice/SpeakPanel.tsx',
      'components/practice/WordSheet.tsx',
      'components/voice/VoiceRow.tsx',
    ]);
    // One row, one size prop: the whole screen on /talk, the 56 pt mic in practice (#386).
    // (Up to the row's own end: its props hold arrows, so `[^>]` would stop early.)
    const row = (size: string) =>
      new RegExp(`<VoiceRow\\b(?:(?!\\n\\s*/>)[\\s\\S])*size="${size}"`);
    expect(holders(row('lg'))).toEqual(['app/talk.tsx']);
    expect(holders(row('md'))).toEqual(['components/practice/CheckBar.tsx']);
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

  it('reads the question again from the conversation row or the question itself, never from a pill', () => {
    expect(holders(/voice\.read_again/)).toEqual([
      // A tap on the question while Vorlesen is on (#434): no control of its own.
      'components/lb/ReadAgain.tsx',
      'components/practice/CheckBar.tsx',
    ]);
  });
});

describe('shared speech behavior (#918)', () => {
  it('gets the roleplay language from one hook for every live mic and speaker', () => {
    for (const file of [
      'app/talk.tsx',
      'components/buddy/Composer.tsx',
      'components/buddy/MessageMenu.tsx',
      'lib/buddy/useHomeSend.ts',
    ]) {
      expect(app.find((s) => s.file === file)!.text, file).toContain('useSceneLanguage(');
    }
  });

  it('keeps recording lifecycle in the dictation and recorder controls', () => {
    expect(holders(/\buseRecording\(/)).toEqual([
      'components/voice/useMicRecorder.ts',
      'components/voice/useVoiceInput.ts',
      'lib/speech/record.ts',
    ]);
  });

  it('uses the same listening control for a chat message', () => {
    expect(app.find((s) => s.file === 'components/buddy/MessageMenu.tsx')!.text).toContain(
      '<ListenButton',
    );
  });
});
