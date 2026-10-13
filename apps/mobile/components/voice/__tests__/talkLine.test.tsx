// The one line under the orb on the conversation screen (design ui_kits/app/Talk.jsx:27–30):
// whose words stand there in which phase, and which sentence of Buddy's reply.

import { describe, expect, it } from 'vitest';

import { sentenceAt, talkLine } from '../talkLine.js';

const none = { heard: '', said: null, reply: null };

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
    const turn = { heard: '', said: 'Was steht an?', reply: 'Noch nichts.' };
    expect(talkLine({ ...turn, phase: 'speaking' })).toEqual({
      who: 'buddy',
      text: 'Noch nichts.',
      speaking: true,
    });
  });

  it('keeps what he said readable once he is silent — not as if he still said it (rule 5)', () => {
    const turn = { heard: '', said: 'Mir geht es schlecht.', reply: 'Ruf an: 116 111.' };
    const quiet = { who: 'buddy', text: 'Ruf an: 116 111.', speaking: false };
    expect(talkLine({ ...turn, phase: 'paused' })).toEqual(quiet);
    // The microphone opened again by itself: his answer stays until she says something.
    expect(talkLine({ ...turn, phase: 'listening' })).toEqual(quiet);
    expect(talkLine({ ...turn, phase: 'listening', heard: 'Okay' })).toEqual({
      who: 'her',
      text: 'Okay',
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
