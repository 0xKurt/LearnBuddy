// Android: a photo taken while the system killed the app (low memory) is not
// lost (audit M-22). Before the camera opens, capture notes what it is for;
// on the next start the app asks the picker for the pending result and opens
// capture with it. Other platforms have no pending results.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { z } from 'zod';

import { readItem, writeItem } from '../api/outboxStorage.js';
import { cameraOpenOf, DraftLinkSchema, type DraftLink } from './draft.js';

const OPEN_KEY = 'lb.capture.camera_open';
const PENDING_KEY = 'lb.capture.pending_photos';

const Pending = z.object({ uris: z.array(z.string().min(1)).min(1), link: DraftLinkSchema });

export async function markCameraOpen(link: DraftLink): Promise<void> {
  if (Platform.OS !== 'android') return;
  await writeItem(OPEN_KEY, JSON.stringify({ link, at: new Date().toISOString() }));
}

export async function clearCameraOpen(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await writeItem(OPEN_KEY, null);
}

/** On start: true when a photo from a killed camera session is waiting for capture. */
export async function recoverCameraResult(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const open = cameraOpenOf(await readItem(OPEN_KEY), new Date());
    await writeItem(OPEN_KEY, null);
    const result = await ImagePicker.getPendingResultAsync();
    if (!open || !result || !('assets' in result) || result.canceled || !result.assets?.length)
      return false;
    await writeItem(
      PENDING_KEY,
      JSON.stringify({ uris: result.assets.map((a) => a.uri), link: open.link }),
    );
    return true;
  } catch {
    return false;
  }
}

/** The recovered photos and what they were for, once (capture takes them). */
export async function takePendingPhotos(): Promise<{ uris: string[]; link: DraftLink } | null> {
  const raw = await readItem(PENDING_KEY);
  await writeItem(PENDING_KEY, null);
  if (!raw) return null;
  try {
    const p = Pending.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
