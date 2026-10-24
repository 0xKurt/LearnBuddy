// Android: a photo taken while the system killed the app (low memory) is not
// lost (audit M-22). Before the camera opens, capture notes what it is for;
// on the next start the app asks the picker for the pending result and opens
// capture with it. Other platforms have no pending results.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { z } from 'zod';

import { readItem, writeItem } from '../api/outboxStorage.js';
import {
  cameraOpenOf,
  DraftLinkSchema,
  WorkTargetSchema,
  type WorkTarget,
  type DraftLink,
} from './draft.js';

const OPEN_KEY = 'lb.capture.camera_open';
const PENDING_KEY = 'lb.capture.pending_photos';

const Pending = z.object({
  uris: z.array(z.string().min(1)).min(1),
  link: DraftLinkSchema.nullable(),
  work: WorkTargetSchema.optional(),
  at: z.string(),
});

export async function markCameraOpen(target: DraftLink | WorkTarget): Promise<void> {
  if (Platform.OS !== 'android') return;
  await writeItem(
    OPEN_KEY,
    JSON.stringify({
      ...('itemId' in target ? { link: null, work: target } : { link: target }),
      at: new Date().toISOString(),
    }),
  );
}

export async function clearCameraOpen(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await writeItem(OPEN_KEY, null);
}

/** On start: the destination of a photo from a killed camera session. */
export async function recoverCameraResult(): Promise<
  { kind: 'capture' } | { kind: 'work'; target: WorkTarget } | null
> {
  if (Platform.OS !== 'android') return null;
  try {
    const open = cameraOpenOf(await readItem(OPEN_KEY), new Date());
    await writeItem(OPEN_KEY, null);
    const result = await ImagePicker.getPendingResultAsync();
    if (!open || !result || !('assets' in result) || result.canceled || !result.assets?.length)
      return null;
    await writeItem(
      PENDING_KEY,
      JSON.stringify({ ...open, uris: result.assets.map((a) => a.uri) }),
    );
    return open.work ? { kind: 'work', target: open.work } : { kind: 'capture' };
  } catch {
    return null;
  }
}

/** Only the intended destination consumes a recovered photo. */
async function pendingPhotos() {
  const raw = await readItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = Pending.safeParse(JSON.parse(raw));
    if (p.success && cameraOpenOf(raw, new Date())) return p.data;
  } catch {
    /* An unreadable handover is discarded. */
  }
  await writeItem(PENDING_KEY, null);
  return null;
}

// A remount or two consumers may arrive together; claim a pending result only once.
let claiming: Promise<unknown> = Promise.resolve();
function take<T>(select: (pending: z.infer<typeof Pending>) => T | null): Promise<T | null> {
  const result = claiming.then(async () => {
    const p = await pendingPhotos();
    const found = p ? select(p) : null;
    if (found !== null) await writeItem(PENDING_KEY, null);
    return found;
  });
  claiming = result.catch(() => null);
  return result;
}

export function takePendingPhotos(): Promise<{ uris: string[]; link: DraftLink } | null> {
  return take((p) => (p.link && !p.work ? { uris: p.uris, link: p.link } : null));
}

export function takePendingWork(target: WorkTarget): Promise<string | null> {
  return take((p) =>
    p.work?.sessionId === target.sessionId && p.work.itemId === target.itemId
      ? (p.uris[0] ?? null)
      : null,
  );
}
