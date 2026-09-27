import { describe, expect, it } from 'vitest';

import { createVoiceStore, highlightedSentence, IDLE } from '../voiceState.js';

describe('voice state', () => {
  it('tells listeners about real changes only', () => {
    const store = createVoiceStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.set({
      phase: 'loading',
      text: 'Hallo. Wie geht’s?',
      sentences: ['Hallo.', 'Wie geht’s?'],
      index: 0,
    });
    store.set({ phase: 'loading' });
    store.set({ phase: 'speaking', source: 'natural', progress: 0.5 });
    expect(calls).toBe(2);
    store.reset();
    store.reset();
    expect(store.get()).toBe(IDLE);
    expect(calls).toBe(3);
    off();
    store.set({ phase: 'loading' });
    expect(calls).toBe(3);
  });

  it('highlights the sentence being read of exactly this text', () => {
    const snap = {
      ...IDLE,
      phase: 'speaking' as const,
      text: 'Eins. Zwei.',
      sentences: ['Eins.', 'Zwei.'],
      index: 1,
    };
    expect(highlightedSentence(snap, 'Eins. Zwei.')).toBe(1);
    expect(highlightedSentence(snap, 'Etwas anderes.')).toBeNull();
    expect(highlightedSentence(IDLE, 'Eins. Zwei.')).toBeNull();
    expect(highlightedSentence({ ...snap, index: 5 }, 'Eins. Zwei.')).toBeNull();
  });
});
