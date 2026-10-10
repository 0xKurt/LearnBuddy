// Pages left from before, taken into the chat with the home's "Weiter" (issue #519): from then on
// they are the chat's. Removed there, they must not come back as "Deine Fotos sind noch nicht
// gesendet" — before #519 a capture screen stood in between, and coming back from it read the
// draft again; without that screen the notice kept the draft it had read when the home opened.
// requires live verification in Claude Code session (the phone's draft storage is replaced)

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CaptureDraft } from '../../../lib/capture/draft.js';

const left: CaptureDraft = {
  v: 1,
  savedAt: '2026-10-09T16:00:00.000Z',
  requestId: null,
  photos: [{ uri: 'file:///drafts/a.jpg', problems: [], kept: false, pdf: null }],
  link: {
    stepId: null,
    goalId: null,
    purpose: 'study',
    completes: null,
    pages: null,
    add: false,
  },
};

vi.mock('../../../lib/capture/draftStorage.js', () => ({
  drafts: {
    leftBehind: () => Promise.resolve(left),
    prune: () => Promise.resolve(),
    drop: () => Promise.resolve(),
    save: () => Promise.resolve(),
  },
}));

const { useHomePhotos } = await import('../../../lib/buddy/useHomePhotos.js');
const { useLiveAttachments } = await import('../../../lib/capture/live.js');

describe('pages left from before, once the chat has taken them', () => {
  it('do not come back as left behind when she removes them in the chat', async () => {
    const { result } = renderHook(() => useHomePhotos(undefined));
    await waitFor(() => expect(result.current.left.shown).toEqual(left));
    // "Weiter": the chat's bar holds the page.
    act(() => useLiveAttachments.getState().set(1));
    expect(result.current.left.shown).toBeNull();
    // She removes it there: nothing is left behind.
    act(() => useLiveAttachments.getState().set(0));
    expect(result.current.left.shown).toBeNull();
  });
});
