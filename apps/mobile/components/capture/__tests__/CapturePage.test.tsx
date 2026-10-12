// requires live verification in Claude Code session
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageHandler } from '../../../lib/capture/pages.js';

const seam = vi.hoisted(() => ({
  finish: () => undefined as void,
  reject: () => undefined as void,
  start: vi.fn(),
  invalidate: vi.fn(),
  local: vi.fn(),
  completed: vi.fn(),
  generation: 0,
  persistSent: vi.fn(async (): Promise<void> => undefined),
}));
vi.mock('../../../lib/api/queries.js', () => ({
  keys: { home: ['home'], library: ['library'] },
  queryClient: { invalidateQueries: (args: unknown) => seam.invalidate(args) },
}));
vi.mock('../../../lib/api/endpoints.js', () => ({ deleteMaterial: vi.fn() }));
vi.mock('../../../lib/capture/draftStorage.js', () => ({
  drafts: {
    lifetime: () => {
      const generation = seam.generation;
      return () => generation === seam.generation;
    },
    load: async () => ({
      requestId: 'upload-id',
      photos: [{ uri: 'file:///page.jpg', problems: [], kept: false, pdf: null }],
      link: {
        stepId: null,
        goalId: null,
        purpose: 'study',
        completes: null,
        pages: null,
        add: false,
      },
    }),
    save: async () => undefined,
    sent: () => seam.persistSent(),
    startSending: vi.fn(),
    stopSending: vi.fn(),
  },
}));
vi.mock('../../../lib/capture/fileCopy.js', () => ({ ownCopy: vi.fn(), sizeOf: vi.fn() }));
vi.mock('../../../lib/capture/camera.js', () => ({ openCamera: vi.fn() }));
vi.mock('../../../lib/capture/prepare.js', () => ({ preparePhoto: vi.fn() }));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));
vi.mock('expo-image-picker', () => ({}));
import { useAttachments } from '../../../lib/capture/useAttachments.js';
import { pageHandler } from '../../../lib/capture/pages.js';
import { renderInApp } from '../../../testing/render.js';
import { CapturePage } from '../CapturePage.js';

beforeEach(() => {
  vi.clearAllMocks();
  seam.persistSent.mockImplementation(async () => undefined);
  seam.start.mockImplementation(() => ({
    requestId: 'upload-id',
    material: 'material-id',
    pageCount: 1,
    abandonedReservation: null,
    grow: vi.fn(),
    pushReady: async () => undefined,
    send: () =>
      new Promise<void>((done, reject) => {
        seam.finish = done;
        seam.reject = () => reject(new Error('upload failed'));
      }),
  }));
  const handler = pageHandler.get();
  if (!handler)
    pageHandler.fill({
      start: (...args) => seam.start(...args),
      check: { width: 1, run: () => [], Review: () => null },
    } satisfies PageHandler);
});

describe('the full Capture page and requested completion', () => {
  it('uses an ordinary header/back, body and one pinned send action without a dialog', () => {
    const back = vi.fn();
    const send = vi.fn();
    renderInApp(
      <CapturePage
        title="Blatt fotografieren"
        intro="Intro"
        count={1}
        focused
        busy={false}
        canSend
        onBack={back}
        onSend={send}
        onCamera={() => undefined}
        onPhotos={() => undefined}
        onFiles={() => undefined}
        pages={<></>}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Blatt fotografieren')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'An Buddy senden' }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses the existing translated camera action on the empty page', () => {
    renderInApp(
      <CapturePage
        title="Blatt fotografieren"
        intro="Intro"
        count={0}
        focused
        busy={false}
        canSend={false}
        onBack={() => undefined}
        onSend={() => undefined}
        onCamera={() => undefined}
        onPhotos={() => undefined}
        onFiles={() => undefined}
        pages={<></>}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Foto machen' })).toHaveLength(2);
  });

  it('keeps submission completion after unmount while suppressing page-local completion', async () => {
    const hook = renderHook(() => useAttachments({ droppable: false, onSent: seam.local }));
    await act(async () => hook.result.current.resumeDraft(false));
    let sending: Promise<void> | undefined;
    await act(async () => {
      sending = hook.result.current.send(seam.completed);
      await Promise.resolve();
    });
    hook.unmount();
    await act(async () => {
      seam.finish();
      await sending;
    });
    expect(seam.completed).toHaveBeenCalledTimes(1);
    expect(seam.completed).toHaveBeenCalledWith(
      'material-id',
      expect.objectContaining({ purpose: 'study' }),
      'upload-id',
    );
    expect(seam.local).not.toHaveBeenCalled();
    expect(seam.invalidate).toHaveBeenCalledWith({ queryKey: ['home'] });
    expect(seam.invalidate).toHaveBeenCalledWith({ queryKey: ['library'] });
  });
  it('reserves caption only for an accepted upload, never for empty or duplicate sends', async () => {
    const accepted = vi.fn();
    const failed = vi.fn();
    const hook = renderHook(() => useAttachments({ droppable: false }));
    await act(async () =>
      hook.result.current.send(undefined, { onAccepted: accepted, onFailed: failed }),
    );
    expect(accepted).not.toHaveBeenCalled();
    await act(async () => hook.result.current.resumeDraft(false));
    let sending: Promise<void> | undefined;
    await act(async () => {
      sending = hook.result.current.send(undefined, { onAccepted: accepted, onFailed: failed });
      await Promise.resolve();
    });
    expect(accepted).toHaveBeenCalledTimes(1);
    await act(async () =>
      hook.result.current.send(undefined, { onAccepted: accepted, onFailed: failed }),
    );
    expect(accepted).toHaveBeenCalledTimes(1);
    await act(async () => {
      seam.finish();
      await sending;
    });
    expect(failed).not.toHaveBeenCalled();
  });
  it('restores reserved caption through submission completion when upload fails after leaving', async () => {
    const accepted = vi.fn();
    const failed = vi.fn();
    const hook = renderHook(() => useAttachments({ droppable: false }));
    await act(async () => hook.result.current.resumeDraft(false));
    let sending: Promise<void> | undefined;
    await act(async () => {
      sending = hook.result.current.send(undefined, { onAccepted: accepted, onFailed: failed });
      await Promise.resolve();
    });
    hook.unmount();
    await act(async () => {
      seam.reject();
      await sending;
    });
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('does not complete or invalidate a replaced account after sent-record persistence was already underway', async () => {
    const hook = renderHook(() => useAttachments({ droppable: false, onSent: seam.local }));
    await act(async () => hook.result.current.resumeDraft(false));
    let persist!: () => void;
    seam.persistSent.mockImplementation(
      () =>
        new Promise<void>((done) => {
          persist = done;
        }),
    );
    let sending!: Promise<void>;
    await act(async () => {
      sending = hook.result.current.send(seam.completed);
      await Promise.resolve();
    });
    await act(async () => {
      seam.finish();
      await Promise.resolve();
    });
    expect(seam.persistSent).toHaveBeenCalledTimes(1);
    seam.generation++;
    await act(async () => {
      persist();
      await sending;
    });
    expect(seam.completed).not.toHaveBeenCalled();
    expect(seam.local).not.toHaveBeenCalled();
    expect(seam.invalidate).not.toHaveBeenCalled();
  });
});
