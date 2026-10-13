// The one line under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30):
// whose words stand there in which phase, and which sentence of Buddy's reply.

import { describe, expect, it } from 'vitest';

import { lineKey, sentenceAt, talkLine } from '../talkLine.js';

const none = { heard: '', said: null, reply: null };
const streamed = { id: 't1', text: 'Noch nichts.', whole: false };
/** An answer that was not written in front of her: how the fixed help answer arrives (rule 18). */
const help = { id: 't1', text: 'Das klingt schwer. Ruf an: 116 111.', whole: true };

describe('whose words the line shows', () => {
  it('is her own words while she speaks, and nothing before anything was said', () => {
    expect(talkLine({ ...none, phase: 'listening' })).toBeNull();
    expect(talkLine({ ...none, phase: 'paused' })).toBeNull();
    expect(talkLine({ ...none, phase: 'listening', heard: 'Ich schreibe Freitag' })).toEqual({
      who: 'her',
      text: 'Ich schreibe Freitag',
    });
  });

  it('keeps what she said while Buddy thinks', () => {
    expect(talkLine({ ...none, phase: 'thinking', said: 'Was steht an?' })).toEqual({
      who: 'her',
      text: 'Was steht an?',
    });
  });

  it('marks Buddy’s reply as spoken only while he speaks', () => {
    const turn = { heard: '', said: 'Was steht an?', reply: streamed };
    expect(talkLine({ ...turn, phase: 'speaking' })).toEqual({
      who: 'buddy',
      ...streamed,
      speaking: true,
    });
  });

  it('keeps what he said readable once he is silent — not as if he still said it (rule 5)', () => {
    const turn = { heard: '', said: 'Was steht an?', reply: streamed };
    const quiet = { who: 'buddy', ...streamed, speaking: false };
    expect(talkLine({ ...turn, phase: 'paused' })).toEqual(quiet);
    // The microphone opened again by itself: his answer stays until she says something.
    expect(talkLine({ ...turn, phase: 'listening' })).toEqual(quiet);
    expect(talkLine({ ...turn, phase: 'listening', heard: 'Okay' })).toEqual({
      who: 'her',
      text: 'Okay',
    });
  });
});

describe('an answer that arrived whole stays whole (the fixed help answer, rule 18)', () => {
  const turn = { heard: '', said: 'Mir geht es schlecht.', reply: help };

  it('stands in full while he reads it', () => {
    expect(talkLine({ ...turn, phase: 'speaking' })).toEqual({
      who: 'buddy',
      ...help,
      speaking: true,
    });
  });

  it('is not displaced by what the recogniser hears, be it a noise or her next words', () => {
    const kept = { who: 'buddy', ...help, speaking: false };
    expect(talkLine({ ...turn, phase: 'listening' })).toEqual(kept);
    expect(talkLine({ ...turn, phase: 'listening', heard: 'äh' })).toEqual(kept);
    expect(talkLine({ ...turn, phase: 'listening', heard: 'Okay, ich rufe' })).toEqual(kept);
  });

  it('stays through her next turn, while Buddy thinks about it', () => {
    expect(talkLine({ ...turn, said: 'Okay, ich rufe an.', phase: 'thinking' })).toEqual({
      who: 'buddy',
      ...help,
      speaking: false,
    });
    expect(talkLine({ ...turn, phase: 'paused' })?.text).toBe(help.text);
  });

  it('is replaced only by Buddy’s next answer', () => {
    const next = { id: 't2', text: 'Gut, dass du das machst.', whole: false };
    expect(talkLine({ ...turn, reply: next, phase: 'speaking' })).toEqual({
      who: 'buddy',
      ...next,
      speaking: true,
    });
  });
});

describe('which sentence of the reply', () => {
  const reply = 'Okay! Wie sicher fühlst du dich schon beim Kürzen? Sag es mir.';

  it('is the sentence his voice is on', () => {
    expect(sentenceAt(reply, 0)).toBe('Okay!');
    expect(sentenceAt(reply, 1)).toBe('Wie sicher fühlst du dich schon beim Kürzen?');
  });

  it('is the whole reply while no sentence is known', () => {
    expect(sentenceAt(reply, null)).toBe(reply);
    expect(sentenceAt(reply, 9)).toBe(reply);
  });
});

describe('when the line comes in anew', () => {
  const speaking = { who: 'buddy' as const, ...streamed, speaking: true };

  it('not with every chunk of a reply that is still being written', () => {
    const more = { ...speaking, text: 'Noch nichts. Magst du' };
    expect(lineKey(more, null)).toBe(lineKey(speaking, null));
  });

  it('with his next sentence, and with his next reply', () => {
    expect(lineKey(speaking, 1)).not.toBe(lineKey(speaking, 0));
    expect(lineKey({ ...speaking, id: 't2' }, 0)).not.toBe(lineKey(speaking, 0));
  });

  it('once for her words, however they grow, and once for a whole answer', () => {
    expect(lineKey({ who: 'her', text: 'Ich' }, null)).toBe(
      lineKey({ who: 'her', text: 'Ich schreibe' }, null),
    );
    const whole = { who: 'buddy' as const, ...help, speaking: true };
    expect(lineKey(whole, 0)).toBe(lineKey({ ...whole, speaking: false }, 1));
  });
});
