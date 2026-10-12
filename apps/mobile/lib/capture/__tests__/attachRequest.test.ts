// The one way to a photo (issue #519): a place asks, the chat's input bar answers once.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
vi.mock('expo-router', () => ({ router: { navigate: (href: string) => navigate(href) } }));

const { askAttach, attachInChat, CHAT_LINK, useAttachRequest } =
  await import('../attachRequest.js');

describe('a wish for the full Capture page', () => {
  beforeEach(() => {
    navigate.mockClear();
    useAttachRequest.getState().take();
  });
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

  it('from another screen: navigates once with every link field preserved', () => {
    attachInChat({ open: 'menu', link: { completes: 'm1', add: true } });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/capture');
    expect(useAttachRequest.getState().take()?.link).toEqual({
      ...CHAT_LINK,
      completes: 'm1',
      add: true,
    });
  });
});
