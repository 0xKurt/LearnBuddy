// Vorlesen and Gespräch are two settings (issue #386): a conversation reads aloud too, switching
// reading off ends a conversation, and only Vorlesen is kept on the device.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const written: Array<[string, string]> = [];
vi.mock('../../api/outboxStorage.js', () => ({
  readItem: () => Promise.resolve(null),
  writeItem: (key: string, value: string) => {
    written.push([key, value]);
    return Promise.resolve();
  },
}));

const { readsAloud, useVoiceMode } = await import('../voiceMode.js');

describe('the two voice settings', () => {
  beforeEach(() => {
    useVoiceMode.setState({ readAloud: false, conversation: false });
    written.length = 0;
  });

  it('starts silent', () => {
    expect(readsAloud(useVoiceMode.getState())).toBe(false);
  });

  it('reads aloud in a conversation, without changing her own choice', () => {
    useVoiceMode.getState().setConversation(true);
    expect(readsAloud(useVoiceMode.getState())).toBe(true);
    expect(useVoiceMode.getState().readAloud).toBe(false);
    // Back to the keyboard: silent again, as she had it.
    useVoiceMode.getState().setConversation(false);
    expect(readsAloud(useVoiceMode.getState())).toBe(false);
    expect(written).toEqual([]);
  });

  it('keeps reading after a conversation when Vorlesen is on', () => {
    useVoiceMode.getState().setReadAloud(true);
    useVoiceMode.getState().setConversation(true);
    useVoiceMode.getState().setConversation(false);
    expect(readsAloud(useVoiceMode.getState())).toBe(true);
  });

  it('ends a conversation when reading aloud is switched off', () => {
    useVoiceMode.getState().setConversation(true);
    useVoiceMode.getState().setReadAloud(false);
    expect(useVoiceMode.getState()).toMatchObject({ readAloud: false, conversation: false });
  });

  it('keeps Vorlesen on the device, under the key the single flag used', () => {
    useVoiceMode.getState().setReadAloud(true);
    useVoiceMode.getState().setReadAloud(false);
    expect(written).toEqual([
      ['lb.voiceMode', '1'],
      ['lb.voiceMode', '0'],
    ]);
  });
});
