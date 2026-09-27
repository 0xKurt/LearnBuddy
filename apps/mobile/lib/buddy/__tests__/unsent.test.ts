import { describe, expect, it } from 'vitest';

import { composerAfterSend, inThread } from '../unsent.js';

const msg = (id: string | null) => ({ client_message_id: id });

describe('a failed chat send (audit M-76)', () => {
  it('knows whether the server stored the message', () => {
    expect(inThread({ thread: [msg(null), msg('a')] }, 'a')).toBe(true);
    expect(inThread({ thread: [msg('b')] }, 'a')).toBe(false);
    expect(inThread(undefined, 'a')).toBe(false);
  });

  it('puts a message that never arrived back into the composer', () => {
    expect(composerAfterSend('', 'Kannst du mir helfen?', false)).toBe('Kannst du mir helfen?');
  });

  it('leaves the composer alone once the message is in the thread', () => {
    expect(composerAfterSend('', 'Kannst du mir helfen?', true)).toBe('');
  });

  it('never overwrites what she typed meanwhile', () => {
    expect(composerAfterSend('Noch was', 'Kannst du mir helfen?', false)).toBe('Noch was');
  });
});
