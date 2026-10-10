// The one way to a photo (issue #519): a place asks, the chat's input bar answers once.

import { describe, expect, it, vi } from 'vitest';

const dismissTo = vi.fn();
vi.mock('expo-router', () => ({ router: { dismissTo: (href: string) => dismissTo(href) } }));

const { askAttach, attachInChat, CHAT_LINK, useAttachRequest } =
  await import('../attachRequest.js');

describe('a wish for a page, handed to the chat', () => {
  it('carries what the pages are for, the rest as for the chat', () => {
    askAttach({ open: 'camera', link: { purpose: 'homework', stepId: 's1' } });
    expect(useAttachRequest.getState().take()).toEqual({
      link: { ...CHAT_LINK, purpose: 'homework', stepId: 's1' },
      open: 'camera',
      resume: false,
      pending: false,
    });
  });

  it('is answered once', () => {
    askAttach({ open: 'menu' });
    expect(useAttachRequest.getState().take()?.open).toBe('menu');
    expect(useAttachRequest.getState().take()).toBeNull();
  });

  it('can ask to go on with the pages from before, with the photo Android cut off', () => {
    askAttach({ open: null, resume: true, pending: true });
    expect(useAttachRequest.getState().take()).toMatchObject({
      link: CHAT_LINK,
      open: null,
      resume: true,
      pending: true,
    });
  });

  it('from another screen: back to the chat, where the bar answers it', () => {
    attachInChat({ open: 'menu', link: { completes: 'm1', add: true } });
    expect(dismissTo).toHaveBeenCalledWith('/buddy');
    expect(useAttachRequest.getState().take()?.link).toEqual({
      ...CHAT_LINK,
      completes: 'm1',
      add: true,
    });
  });
});
