// requires live verification in Claude Code session — native picker and local storage.
import { beforeEach, expect, it, vi } from 'vitest';
const outside = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  pending: vi.fn(),
  os: 'android',
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return outside.os;
    },
  },
}));
vi.mock('expo-image-picker', () => ({ getPendingResultAsync: outside.pending }));
vi.mock('../../api/outboxStorage.js', () => ({
  readItem: async (key: string) => outside.storage.get(key) ?? null,
  writeItem: async (key: string, value: string | null) => {
    if (value === null) outside.storage.delete(key);
    else outside.storage.set(key, value);
  },
}));
import {
  markCameraOpen,
  recoverCameraResult,
  takePendingPhotos,
  takePendingWork,
} from '../pendingCamera.js';
const work = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  itemId: '22222222-2222-4222-8222-222222222222',
};
beforeEach(() => {
  outside.storage.clear();
  outside.os = 'android';
  outside.pending.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///work.jpg' }] });
});
it('recovers work to its task once, without letting chat or another task consume it', async () => {
  await markCameraOpen(work);
  expect(await recoverCameraResult()).toEqual({ kind: 'work', target: work });
  expect(await takePendingPhotos()).toBeNull();
  expect(await takePendingWork({ ...work, itemId: work.sessionId })).toBeNull();
  expect(await Promise.all([takePendingWork(work), takePendingWork(work)])).toEqual([
    'file:///work.jpg',
    null,
  ]);
});
it('keeps ordinary material recovery and ignores cancelled camera results', async () => {
  const link = {
    stepId: null,
    goalId: null,
    purpose: 'study' as const,
    completes: null,
    pages: null,
    add: false,
  };
  await markCameraOpen(link);
  expect(await recoverCameraResult()).toEqual({ kind: 'capture' });
  expect(await takePendingPhotos()).toEqual({ link, uris: ['file:///work.jpg'] });
  await markCameraOpen(work);
  outside.pending.mockResolvedValue({ canceled: true });
  expect(await recoverCameraResult()).toBeNull();
});
