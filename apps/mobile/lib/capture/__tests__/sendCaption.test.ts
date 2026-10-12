// requires live verification in Claude Code session
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({
  owner: 'account-a' as string | undefined,
  generation: 0,
  draft: '',
  send: vi.fn(),
  get: vi.fn(),
  home: vi.fn(),
  query: {} as object | undefined,
  pending: [] as {
    requestId: string;
    materialId: string;
    caption: { text: string; owner: string; clientMessageId: string };
  }[],
  finish: vi.fn(),
}));
vi.mock('../../auth/session.js', () => ({
  currentSession: () => (seam.owner ? { user_id: seam.owner } : null),
}));
vi.mock('../../api/client.js', () => ({ newId: () => 'caption-client-id' }));
vi.mock('../../api/endpoints.js', () => ({
  sendMessageStreamed: (...args: unknown[]) => seam.send(...args),
  getHome: () => seam.get(),
}));
vi.mock('../../api/queries.js', () => ({
  keys: { home: ['home'] },
  queryClient: { getQueryCache: () => ({ find: () => seam.query }) },
  setHome: (home: unknown) => seam.home(home),
}));
vi.mock('../../drafts.js', () => ({
  draftGeneration: () => seam.generation,
  updateDraft: (_key: string, update: (current: string) => string) => {
    seam.draft = update(seam.draft);
  },
}));
vi.mock('../draftStorage.js', () => ({
  drafts: {
    lifetime: () => {
      const generation = seam.generation;
      return () => generation === seam.generation;
    },
    startCaption: vi.fn(),
    stopCaption: vi.fn(),
    pendingCaptions: async () => seam.pending,
    load: async () => null,
    abandonCaption: async (requestId: string, id: string) => {
      seam.finish(requestId, id);
      seam.pending = seam.pending.filter(
        (p) => p.requestId !== requestId || p.caption.clientMessageId !== id,
      );
    },
    finishCaption: async (requestId: string, id: string) => {
      seam.finish(requestId, id);
      seam.pending = seam.pending.filter(
        (p) => p.requestId !== requestId || p.caption.clientMessageId !== id,
      );
    },
  },
}));
import { captureCaption, recoverCaptureCaption, supersedeCaptureCaption } from '../sendCaption.js';

beforeEach(() => {
  vi.clearAllMocks();
  seam.owner = 'account-a';
  seam.query = {};
  seam.pending = [];
  seam.draft = 'caption';
});

describe('the requested caption after upload completion', () => {
  it('delivers the immutable caption once after the editor leaves, preserving newer text and silent stream callbacks', async () => {
    const caption = captureCaption(' caption ');
    caption.reserve();
    const completion = () => caption.complete('upload-request');
    seam.draft = 'newer text';
    const home = { thread: [] };
    seam.send.mockResolvedValue({ status: 'failed', home });
    await Promise.all([completion(), completion()]);
    expect(seam.send).toHaveBeenCalledTimes(1);
    expect(seam.send.mock.calls[0]?.slice(0, 3)).toEqual(['caption', 'caption-client-id', null]);
    expect(seam.draft).toBe('newer text');
    expect(seam.home).toHaveBeenCalledWith(home);
    expect(seam.get).not.toHaveBeenCalled();
  });

  it('does not send an old account caption when upload finishes after account replacement', async () => {
    const caption = captureCaption('caption');
    caption.reserve();
    const completion = () => caption.complete('upload-request');
    seam.owner = 'account-b';
    seam.draft = 'new account';
    await completion();
    expect(seam.send).not.toHaveBeenCalled();
    expect(seam.draft).toBe('new account');
  });

  it('confirms an ambiguous transport outcome from the real thread rather than sending twice', async () => {
    const caption = captureCaption('caption');
    caption.reserve();
    const completion = () => caption.complete('upload-request');
    seam.send.mockRejectedValue(new Error('connection lost'));
    seam.get.mockResolvedValue({ thread: [{ client_message_id: 'caption-client-id' }] });
    await completion();
    expect(seam.send).toHaveBeenCalledTimes(1);
    expect(seam.get).toHaveBeenCalledTimes(1);
    expect(seam.draft).toBe('');
  });

  it('restores an unconfirmed caption only into an empty draft', async () => {
    seam.send.mockRejectedValue(new Error('not delivered'));
    seam.get.mockResolvedValue({ thread: [] });
    const first = captureCaption('caption');
    first.reserve();
    await first.complete('upload-request');
    expect(seam.draft).toBe('caption');
    const second = captureCaption('caption');
    seam.draft = 'newer text';
    second.reserve();
    await second.complete('upload-request');
    expect(seam.draft).toBe('newer text');
  });

  it('does not apply a late response or restore text after the account clears', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    seam.send.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const caption = captureCaption('caption');
    caption.reserve();
    const work = caption.complete('upload-request');
    seam.owner = undefined;
    seam.draft = '';
    resolve({ home: { thread: [] }, status: 'accepted' });
    await work;
    expect(seam.home).not.toHaveBeenCalled();
    expect(seam.draft).toBe('');
  });
  it('reserves the submitted text before upload, then restores only an empty same-account draft if upload fails', () => {
    const caption = captureCaption('caption');
    caption.reserve();
    expect(seam.draft).toBe('');
    caption.restore();
    expect(seam.draft).toBe('caption');
    caption.reserve();
    seam.draft = 'newer text';
    caption.restore();
    expect(seam.draft).toBe('newer text');
    seam.owner = 'account-b';
    seam.draft = '';
    caption.restore();
    expect(seam.draft).toBe('');
  });
  it('does not write a late response after an account wipe followed by the same account signing in again', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    seam.send.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const caption = captureCaption('caption');
    caption.reserve();
    const work = caption.complete('upload-request');
    seam.generation += 1;
    seam.draft = 'same account, new session text';
    resolve({ home: { thread: [] }, status: 'accepted' });
    await work;
    expect(seam.home).not.toHaveBeenCalled();
    expect(seam.draft).toBe('same account, new session text');
  });

  it('recovers only after confirming the real thread and preserves the original retry identity', async () => {
    seam.draft = '';
    seam.pending = [
      {
        requestId: 'upload-request',
        materialId: 'actual-material',
        caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
      },
    ];
    seam.get.mockResolvedValue({ thread: [] });
    const recovered = await recoverCaptureCaption();
    expect(recovered?.caption.clientMessageId).toBe('original-id');
    expect(seam.draft).toBe('caption');
    expect(seam.send).not.toHaveBeenCalled();
    const retry = captureCaption('caption', recovered?.caption);
    expect(retry.metadata?.clientMessageId).toBe('original-id');
  });

  it('does not overwrite newer text or abandon its pending caption before actual recovery', async () => {
    seam.draft = 'newer text';
    seam.pending = [
      {
        requestId: 'upload-request',
        materialId: 'actual-material',
        caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
      },
    ];
    seam.get.mockResolvedValue({ thread: [] });
    expect(await recoverCaptureCaption()).toBeNull();
    expect(seam.draft).toBe('newer text');
    expect(seam.finish).not.toHaveBeenCalled();
    await supersedeCaptureCaption('newer text', 'edited newer text');
    expect(seam.finish).not.toHaveBeenCalled();
  });

  it('treats a deliberate edit or clear of recovered text as superseding that pending caption', async () => {
    seam.pending = [
      {
        requestId: 'upload-request',
        materialId: 'actual-material',
        caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
      },
    ];
    await supersedeCaptureCaption('caption', 'replacement');
    expect(seam.finish).toHaveBeenCalledWith('upload-request', 'original-id');
    expect(seam.pending).toEqual([]);
    expect(seam.send).not.toHaveBeenCalled();
    seam.pending = [
      {
        requestId: 'upload-request',
        materialId: 'actual-material',
        caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
      },
    ];
    await supersedeCaptureCaption('caption', '');
    expect(seam.pending).toEqual([]);
  });

  it.each(['', 'caption', 'newer text'])(
    'clears a confirmed stored turn after restart with existing draft %j without restoring or sending it again',
    async (currentDraft) => {
      seam.draft = currentDraft;
      seam.pending = [
        {
          requestId: 'upload-request',
          materialId: 'actual-material',
          caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
        },
      ];
      seam.get.mockResolvedValue({ thread: [{ client_message_id: 'original-id' }] });
      const recovered = await recoverCaptureCaption('caption');
      expect(recovered).toMatchObject({
        confirmed: true,
        caption: { clientMessageId: 'original-id' },
      });
      expect(seam.draft).toBe(currentDraft === 'caption' ? '' : currentDraft);
      expect(seam.pending).toEqual([]);
      expect(seam.send).not.toHaveBeenCalled();
    },
  );

  it('keeps the local immutable ID for an unchanged explicit retry when confirmation GET is offline', async () => {
    seam.draft = 'caption';
    seam.pending = [
      {
        requestId: 'upload-request',
        materialId: 'actual-material',
        caption: { text: 'caption', owner: 'account-a', clientMessageId: 'original-id' },
      },
    ];
    seam.get.mockRejectedValue(new Error('offline'));
    const retry = await recoverCaptureCaption();
    expect(retry?.caption.clientMessageId).toBe('original-id');
    expect(seam.draft).toBe('caption');
    expect(seam.send).not.toHaveBeenCalled();
  });
});
