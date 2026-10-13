// The chat head "listens" only while she is really writing or dictating (#599, review of #608):
// before this, text in the field of the open chat was enough — a restored draft kept Buddy
// leaning in for as long as the chat stood there.

import { describe, expect, it } from 'vitest';

import { isTyping, type TypingFacts } from '../typing.js';

const facts = (over: Partial<TypingFacts>): TypingFacts => ({
  onScreen: true,
  fieldFocused: false,
  text: '',
  dictating: false,
  ...over,
});

describe('isTyping', () => {
  it('is true while the focused field holds something', () => {
    expect(isTyping(facts({ fieldFocused: true, text: 'Ich schreibe' }))).toBe(true);
  });

  it('is false for text nobody is typing: a restored draft, a message put back', () => {
    expect(isTyping(facts({ text: 'Entwurf von gestern' }))).toBe(false);
  });

  it('ends on send (the field is empty) and on blur', () => {
    expect(isTyping(facts({ fieldFocused: true, text: '' }))).toBe(false);
    expect(isTyping(facts({ fieldFocused: false, text: 'halb' }))).toBe(false);
  });

  it('is true while she dictates, whatever the field holds or has', () => {
    expect(isTyping(facts({ dictating: true }))).toBe(true);
  });

  it('is false once another screen stands over the chat', () => {
    expect(isTyping(facts({ onScreen: false, fieldFocused: true, text: 'x' }))).toBe(false);
    expect(isTyping(facts({ onScreen: false, dictating: true }))).toBe(false);
  });
});
