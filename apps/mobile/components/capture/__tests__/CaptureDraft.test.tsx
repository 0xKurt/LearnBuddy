// requires live verification in Claude Code session
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({
  owner: 'account-a',
  release: () => undefined as void,
  pending: null as Promise<
    {
      requestId: string;
      materialId: string;
      caption: { text: string; owner: string; clientMessageId: string };
    }[]
  > | null,
  query: {},
  get: vi.fn(),
  sendingCaption: null as { owner: string; text: string } | null,
}));
vi.mock('../../../lib/api/client.js', () => ({ newId: () => 'client-id' }));
vi.mock('../../../lib/auth/session.js', () => ({
  currentSession: () => ({ user_id: seam.owner }),
}));
vi.mock('../../../lib/api/queries.js', () => ({
  keys: { home: ['home'] },
  queryClient: { getQueryCache: () => ({ find: () => seam.query }) },
  setHome: vi.fn(),
}));
vi.mock('../../../lib/api/endpoints.js', () => ({
  getHome: () => seam.get(),
  sendMessageStreamed: vi.fn(),
}));
vi.mock('../../../lib/capture/draftStorage.js', () => ({
  drafts: {
    lifetime: () => () => true,
    isSendingCaption: (owner: string, text: string) =>
      seam.sendingCaption?.owner === owner && seam.sendingCaption.text === text.trim(),
    pendingCaptions: () => seam.pending ?? Promise.resolve([]),
    load: async () => null,
    startCaption: vi.fn(),
    stopCaption: vi.fn(),
    finishCaption: async () => {
      seam.pending = null;
    },
  },
}));
vi.mock('../../voice/useVoiceInput.js', () => ({
  useVoiceInput: () => ({ state: 'idle', cancel: vi.fn(), toggle: vi.fn() }),
}));
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('../../../lib/api/outboxStorage.js', () => ({
  readItem: async (key: string) => storage.get(key) ?? null,
  writeItem: async (key: string, value: string | null) => {
    if (value === null) storage.delete(key);
    else storage.set(key, value);
  },
}));
import { Composer } from '../../buddy/Composer.js';
import { renderInApp } from '../../../testing/render.js';
import { clearDrafts, useDraft } from '../../../lib/drafts.js';
import { captureCaption } from '../../../lib/capture/sendCaption.js';
import { sendMessageStreamed } from '../../../lib/api/endpoints.js';

afterEach(async () => {
  await clearDrafts();
  storage.clear();
  seam.sendingCaption = null;
});

describe('the caption shared by chat and the capture page', () => {
  it('keeps both mounted editors current and does not resurrect text after the old editor leaves', async () => {
    const chat = renderHook(() => useDraft('chat'));
    await act(async () => undefined);
    act(() => chat.result.current.setText('old caption'));
    const capture = renderHook(() => useDraft('chat'));
    await waitFor(() => expect(capture.result.current.text).toBe('old caption'));
    act(() => capture.result.current.setText('new caption'));
    expect(chat.result.current.text).toBe('new caption');
    chat.unmount();
    const returned = renderHook(() => useDraft('chat'));
    await waitFor(() => expect(returned.result.current.text).toBe('new caption'));
  });

  it('does not restore a sent caption when the older hidden editor unmounts', async () => {
    const chat = renderHook(() => useDraft('chat'));
    await act(async () => undefined);
    act(() => chat.result.current.setText('submitted caption'));
    const capture = renderHook(() => useDraft('chat'));
    await waitFor(() => expect(capture.result.current.text).toBe('submitted caption'));
    act(() => capture.result.current.clear());
    chat.unmount();
    const returned = renderHook(() => useDraft('chat'));
    await waitFor(() => expect(returned.result.current.text).toBe(''));
    expect(storage.get('lb.draft.chat')).toBeUndefined();
  });
  it('keeps an account wipe authoritative when both old editors leave', async () => {
    const chat = renderHook(() => useDraft('chat'));
    await act(async () => undefined);
    act(() => chat.result.current.setText('private old-account caption'));
    const capture = renderHook(() => useDraft('chat'));
    await waitFor(() => expect(capture.result.current.text).toBe('private old-account caption'));
    await act(async () => clearDrafts());
    expect(chat.result.current.text).toBe('');
    expect(capture.result.current.text).toBe('');
    chat.unmount();
    capture.unmount();
    const returned = renderHook(() => useDraft('chat'));
    await act(async () => undefined);
    expect(returned.result.current.text).toBe('');
    expect(storage.get('lb.draft.chat')).toBeUndefined();
  });
  it('does not send ordinary text after account wipe during the newly asynchronous recovery lookup', async () => {
    seam.pending = new Promise<never[]>((done) => {
      seam.release = () => done([]);
    });
    const send = vi.fn(async () => true);
    renderInApp(<Composer disabled={false} onSend={send} onTalk={() => undefined} />);
    await act(async () => undefined);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ordinary message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await act(async () => clearDrafts());
    await act(async () => {
      seam.release();
      await Promise.resolve();
    });
    expect(send).not.toHaveBeenCalled();
    seam.pending = null;
  });
  it('does not send a requested upload caption again from Chat while durable submission persistence is pending', async () => {
    const requests = vi.fn();
    vi.mocked(sendMessageStreamed).mockImplementation(async () => {
      requests('upload-caption');
      return { status: 'done', home: { thread: [] } } as never;
    });
    const draft = renderHook(() => useDraft('chat'));
    await act(async () => undefined);
    act(() => draft.result.current.setText('requested caption'));
    const caption = captureCaption(draft.result.current.text);
    seam.sendingCaption = caption.metadata ?? null;
    let persisted!: () => void;
    const storageWrite = new Promise<void>((done) => {
      persisted = done;
    });
    // The route's accepted submission waits for durable storage before reserve/completion.
    const uploading = storageWrite.then(async () => {
      caption.reserve();
      await caption.complete('upload-request');
    });
    renderInApp(
      <Composer
        disabled={false}
        onSend={async () => {
          requests('chat');
          return true;
        }}
        onTalk={() => undefined}
      />,
    );
    await act(async () => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await act(async () => {
      persisted();
      await uploading;
    });
    expect(requests).toHaveBeenCalledTimes(1);
  });
  it('rechecks upload ownership after recovery lookup while allowing unrelated newer text', async () => {
    seam.pending = new Promise<never[]>((done) => {
      seam.release = () => done([]);
    });
    const send = vi.fn(async () => true);
    renderInApp(<Composer disabled={false} onSend={send} onTalk={() => undefined} />);
    await act(async () => undefined);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'requested caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    seam.sendingCaption = { owner: 'account-a', text: 'requested caption' };
    await act(async () => {
      seam.release();
      await Promise.resolve();
    });
    expect(send).not.toHaveBeenCalled();
    seam.pending = null;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'newer message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('newer message', undefined));
  });
  it('does not turn a confirmed unchanged recovery retry into a new message but allows a later distinct intent', async () => {
    const send = vi.fn(async () => true);
    renderInApp(<Composer disabled={false} onSend={send} onTalk={() => undefined} />);
    await act(async () => undefined);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'caption' } });
    seam.pending = Promise.resolve([
      {
        requestId: 'request',
        materialId: 'material',
        caption: { owner: 'account-a', text: 'caption', clientMessageId: 'original-id' },
      },
    ]);
    let confirm!: (value: unknown) => void;
    seam.get.mockReturnValue(
      new Promise((done) => {
        confirm = done;
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await act(async () => undefined);
    await act(async () => {
      confirm({ thread: [{ client_message_id: 'original-id' }] });
    });
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('')).toBe(screen.getByRole('textbox'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('caption', undefined));
  });
});
