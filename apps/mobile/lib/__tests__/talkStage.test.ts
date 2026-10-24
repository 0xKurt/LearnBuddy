// The conversation screen and the spoken modes as the design has them (#599), read from the
// source like `oneVoice.test.ts`:
//
//   · the orb is the stage (ui_kits/app/Talk.jsx:22–45): 150 pt, 36 to the caption, room for one
//     status and ONE line of words; the thread's bubbles stand only where there is something to
//     tap or a scene runs;
//   · the orb's state is what really happens (`talkMode` → `moonForTalk`), never a constant;
//   · a photo goes through the chat's bar (owner 12.10.), never to a page;
//   · a roleplay and a rehearsal are the thread's one card, their results one card
//     (components/practice/Modes.jsx:20–66), and nothing but the orb moves by itself (HANDOFF §4).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TALK } from '../theme/talk.js';

const ROOT = join(__dirname, '../..');
const source = (file: string) => readFileSync(join(ROOT, file), 'utf8');
/** Without comments: a guard reads what the screen does, not what it says about itself. */
const code = (file: string) =>
  source(file)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the stage (Talk.jsx:22–45)', () => {
  it('has the design’s measures', () => {
    expect(TALK.stageSize).toBe(150);
    expect(TALK.groupGap).toBe(36);
    expect(TALK.captionHeight).toBe(110);
    expect(TALK.captionGap).toBe(10);
    expect([TALK.sideSize, TALK.micHeight, TALK.micPadding, TALK.micGlyph]).toEqual([
      52, 64, 26, 22,
    ]);
    // A scene shares the screen with its lines (ui_kits/app/Extra.jsx:190).
    expect(TALK.liveStageSize).toBe(120);
  });

  it('says one status and one line; bubbles only where the thread has something to show', () => {
    const talk = code('app/talk.tsx');
    // The stage holds the one caption, the tail the thread's bubbles (#599 correction).
    expect(talk.match(/<TalkStage\b/g)).toHaveLength(1);
    expect(code('components/voice/TalkStage.tsx').match(/<TalkCaption\b/g)).toHaveLength(1);
    expect(talk.match(/<TalkTail\b/g)).toHaveLength(1);
    expect(code('components/voice/TalkTail.tsx').match(/<Conversation\b/g)).toHaveLength(1);
    expect(talk).not.toMatch(/<(TalkCaption|Conversation)\b/);
    expect(talk.indexOf('{threaded ? (')).toBeGreaterThan(-1);
    expect(talk.indexOf('<TalkTail')).toBeGreaterThan(talk.indexOf('{threaded ? ('));
    // The second line of hints under the status is gone, with its texts.
    expect(talk).not.toMatch(/talk\.(tap_orb|barge_sub|paused_sub)/);
    const de = JSON.parse(source('locales/de/buddy.json')) as { talk: Record<string, string> };
    for (const gone of ['tap_orb', 'barge_sub', 'paused_sub'])
      expect(de.talk[gone]).toBeUndefined();
  });

  it('claims listening only while the microphone records', () => {
    const talk = code('app/talk.tsx');
    expect(talk).toMatch(
      /const listening = phase === 'listening' && voice\.state === 'recording';/,
    );
    // What the status says is decided in lib/speech/talkState.ts (`talkStatus`, tested there).
    expect(talk).toMatch(/const status = t\(\s*talkStatus\(\{/);
    // The recogniser's own state, shown as getting ready while Talk opens (#644, `shownMic`).
    expect(talk).toMatch(/const mic = shownMic\(\s*voice\.state,/);
    expect(talk).toMatch(/talkHeadline\(listening \? 'listening' : phase, mic\)/);
  });

  it('never writes an older home over a newer one when a turn comes back late', () => {
    // Her turn and "Gespräch beenden" can both be on their way. The fence is not Talk's own any
    // more: every home goes through `setHome` → `writeHome`, which drops the older one
    // (lib/api/__tests__/homeCache.test.ts), and Talk writes the cache in no other way.
    const talk = code('app/talk.tsx');
    expect(talk.match(/\bsetHome\(/g)).toHaveLength(1);
    expect(talk).not.toMatch(/setQueryData|writeHome/);
    expect(code('lib/api/queries.ts')).toMatch(
      /export function setHome\(home: BuddyHome\): void \{[^}]*writeHome\(queryClient, home\);\s*\}/,
    );
    expect(code('lib/api/homeCache.ts')).toMatch(
      /export function writeHome\([^)]*\): boolean \{\s*if \(!newerHome\(home, client\.getQueryData<BuddyHome>\(keys\.home\)\)\) return false;/,
    );
  });

  it('gives the orb the state of what really happens, never a constant', () => {
    const talk = code('app/talk.tsx');
    expect(talk).toMatch(/const orbMode: OrbMode = talkMode\(\{/);
    expect(talk.match(/<TalkStage\b[\s\S]*?\/>/)?.[0]).toMatch(/mode=\{orbMode\}/);
    expect(code('components/voice/TalkStage.tsx').match(/<TalkOrb\b[\s\S]*?\/>/)?.[0]).toMatch(
      /mode=\{mode\}/,
    );
    const orb = code('components/voice/TalkOrb.tsx');
    expect(orb).toMatch(/<BuddyOrb size=\{size\} state=\{moonForTalk\(mode\)\}/);
  });

  it('keeps every way on and off the screen: keyboard, microphone, photo through the chat bar', () => {
    const talk = code('app/talk.tsx');
    expect(talk).toMatch(/left=\{\{ icon: 'keyboard'[^}]*onPress: leave \}\}/);
    expect(talk).toMatch(/attachInChat\(\{ open: 'menu' \}\)/);
    expect(talk).not.toMatch(/['"`]\/capture/);
    expect(talk).toMatch(/onMagicTap=\{onMic\}/);
    expect(talk).toMatch(/onPress: interrupt/);
    expect(talk).toMatch(/useBargeMonitor\(/);
  });
});

describe('roleplay and rehearsal (Modes.jsx:20–66)', () => {
  it('are the thread’s one card, not a frame of their own', () => {
    for (const file of ['components/buddy/RoleplayCard.tsx', 'components/buddy/RehearseCard.tsx']) {
      const card = code(file);
      expect(card, file).toMatch(/<ChatCard\b/);
      expect(card, file).not.toMatch(/<Card\b|OfferShell|toUpperCase/);
    }
    expect(existsSync(join(ROOT, 'components/learn/OfferShell.tsx'))).toBe(false);
  });

  it('end in one result card, not a stack of cards', () => {
    for (const file of [
      'components/buddy/RoleplayResult.tsx',
      'components/buddy/RehearsalResult.tsx',
    ]) {
      const result = code(file);
      expect(result, file).toMatch(/<ModeResult\b/);
      expect(result, file).not.toMatch(/ResultList/);
    }
    expect(code('components/buddy/RoleplayModeResult.tsx').match(/<Card\b/g)).toHaveLength(1);
  });

  it('ends a spoken scene on the conversation screen, the same way the chat’s strip does', () => {
    expect(code('app/talk.tsx')).toMatch(/useEndScene\(scene\?\.id \?\? null\)/);
    expect(code('components/learn/talkScene.ts')).toMatch(/useEnd: useEndRoleplay/);
    expect(code('components/buddy/RoleplayCard.tsx')).toMatch(/useEndRoleplay\(roleplay\.id\)/);
  });

  it('lets nothing but the orb move by itself while a recording runs', () => {
    for (const file of [
      'components/voice/RecordingStatus.tsx',
      'components/buddy/RehearseCard.tsx',
    ])
      expect(code(file), file).not.toMatch(/Animated|withRepeat/);
    expect(source('lib/theme/motionDurations.ts')).not.toMatch(/recordingPulse/);
  });
});
