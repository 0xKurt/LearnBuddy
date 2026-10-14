// "Ich höre zu." is a claim about a running microphone (issue #158, CLAUDE.md rule 5).

import { describe, expect, it } from 'vitest';

import {
  heardHim,
  shownMic,
  talkHeadline,
  talkStatus,
  type MicState,
  type TalkPhase,
} from '../talkState.js';

const MICS: MicState[] = ['idle', 'starting', 'recording', 'transcribing'];
const PHASES: TalkPhase[] = ['listening', 'thinking', 'speaking', 'paused'];

describe('what the conversation screen says', () => {
  it('never says "listening" while the recorder is still starting', () => {
    for (const phase of PHASES) {
      expect(talkHeadline(phase, 'starting')).not.toBe('buddy:talk.listening');
    }
    expect(talkHeadline('listening', 'starting')).toBe('buddy:talk.getting_ready');
  });

  it('says "listening" only once the recorder really runs', () => {
    expect(talkHeadline('listening', 'recording')).toBe('buddy:talk.listening');
    // Idle with the screen in its listening phase is the moment right before the start —
    // the app is between turns and the microphone is not holding anything yet.
    expect(talkHeadline('listening', 'idle')).toBe('buddy:talk.listening');
  });

  it('puts what Buddy is doing before what the microphone is doing', () => {
    expect(talkHeadline('thinking', 'starting')).toBe('buddy:talk.thinking');
    expect(talkHeadline('speaking', 'starting')).toBe('buddy:talk.speaking');
    // Her words are being turned into text: that is thinking, whatever the screen's phase.
    for (const phase of PHASES) {
      expect(talkHeadline(phase, 'transcribing')).toBe('buddy:talk.thinking');
    }
  });

  it('falls back to her turn', () => {
    for (const mic of MICS) {
      if (mic === 'starting' || mic === 'transcribing') continue;
      expect(talkHeadline('paused', mic)).toBe('buddy:talk.paused');
    }
  });
});

describe('the one status line (design ui_kits/app/Talk.jsx:28)', () => {
  const base = {
    phase: 'listening' as TalkPhase,
    mic: 'recording' as MicState,
    endsByItself: true,
    voice: 'idle' as const,
    heard: false,
  };

  it('says how her turn ends only while the recorder really runs', () => {
    expect(talkStatus(base)).toBe('buddy:talk.listening_sub');
    expect(talkStatus({ ...base, endsByItself: false })).toBe('buddy:talk.tap_when_done');
    expect(talkStatus({ ...base, mic: 'starting' })).toBe('buddy:talk.getting_ready');
    expect(talkStatus({ ...base, mic: 'idle' })).toBe('buddy:talk.listening');
    expect(talkStatus({ ...base, mic: 'transcribing' })).toBe('buddy:talk.thinking');
  });

  it('never says "Buddy spricht" before his first audio is heard', () => {
    const speaking = { ...base, phase: 'speaking' as TalkPhase, mic: 'idle' as MicState };
    expect(talkStatus({ ...speaking, voice: 'idle' })).toBe('buddy:talk.thinking');
    expect(talkStatus({ ...speaking, voice: 'loading' })).toBe('buddy:talk.thinking');
    expect(talkStatus({ ...speaking, voice: 'speaking' })).toBe('buddy:talk.speaking');
  });

  it('holds "Buddy spricht" across the gap between two sentences of one reply', () => {
    const between = {
      ...base,
      phase: 'speaking' as TalkPhase,
      mic: 'idle' as MicState,
      heard: true,
    };
    expect(talkStatus({ ...between, voice: 'loading' })).toBe('buddy:talk.speaking');
    expect(talkStatus({ ...between, voice: 'idle' })).toBe('buddy:talk.speaking');
  });

  it('never says it after his last word: the phase has moved on', () => {
    for (const phase of ['listening', 'thinking', 'paused'] as TalkPhase[])
      for (const mic of MICS)
        expect(talkStatus({ ...base, phase, mic, heard: true, voice: 'idle' })).not.toBe(
          'buddy:talk.speaking',
        );
  });

  it('remembers that he was heard for this reply only', () => {
    expect(heardHim(false, 'speaking', 'loading')).toBe(false);
    expect(heardHim(false, 'speaking', 'speaking')).toBe(true);
    expect(heardHim(true, 'speaking', 'loading')).toBe(true);
    expect(heardHim(true, 'speaking', 'idle')).toBe(true);
    // Any other phase starts over, whatever the voice store still holds.
    expect(heardHim(true, 'listening', 'speaking')).toBe(false);
    expect(heardHim(true, 'thinking', 'idle')).toBe(false);
    expect(heardHim(true, 'paused', 'idle')).toBe(false);
  });

  it('says "getting ready" from the first frame of a Talk that will listen, never "paused" (#644)', () => {
    expect(talkHeadline('paused', shownMic('idle', true))).toBe('buddy:talk.getting_ready');
    expect(talkHeadline('paused', shownMic('idle', false))).toBe('buddy:talk.paused');
    // Once the recogniser has its own state, that state is what is shown.
    for (const mic of MICS.filter((m) => m !== 'idle')) expect(shownMic(mic, true)).toBe(mic);
  });
});
