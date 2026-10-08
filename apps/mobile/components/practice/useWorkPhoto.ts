// Her working, photographed (issue #444): the camera, the check on the phone, the reading — and
// the copy into her answer field. What a reading means for the field is `lib/practice/workPhoto.ts`;
// this is the part that needs the device and the API. The pieces are the sheet's own: the same
// camera (`lib/capture/camera.ts`), the same prepared JPEG and quality check
// (`lib/capture/upload.ts` `preparePhoto`), the same card when the phone finds it hard to read
// (`PhotoCheckCard`). Only where it goes differs: read in the request and dropped, never uploaded.

import { WORK_PHOTO_BASE64_MAX } from '@learnbuddy/shared-types/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError, isOutdated } from '../../lib/api/apiError.js';
import { readWorkPhoto } from '../../lib/api/endpoints.js';
import { keys, queryClient } from '../../lib/api/queries.js';
import { openCamera } from '../../lib/capture/camera.js';
import { preparePhoto } from '../../lib/capture/upload.js';
import { messageFor } from '../../lib/errors.js';
import { fieldFrom, type WorkPhotoState } from '../../lib/practice/workPhoto.js';

export type WorkPhoto = {
  state: WorkPhotoState;
  /** The camera button: take a photo of her working (again). */
  take: () => void;
  /** "Trotzdem behalten" on the phone's check: read it as it is. */
  keep: () => void;
  /** She sent her answer: the copy is hers now, the note goes. */
  done: () => void;
};

/** The question her working is for. */
export type WorkTarget = { sessionId: string; itemId: string };

export function useWorkPhoto(target: WorkTarget, onCopy: (text: string) => void): WorkPhoto {
  const { t } = useTranslation(['practice', 'capture']);
  const [state, setState] = useState<WorkPhotoState>({ step: 'idle' });
  // The question this flow is for right now: a reading that comes back for another one is dropped.
  const current = useRef(target.itemId);
  const busy = useRef(false);
  const copy = useRef(onCopy);
  copy.current = onCopy;
  useEffect(() => {
    current.current = target.itemId;
    setState({ step: 'idle' });
  }, [target.itemId]);

  async function read(base64: string): Promise<void> {
    const itemId = target.itemId;
    setState({ step: 'reading' });
    try {
      if (base64.length > WORK_PHOTO_BASE64_MAX) throw new ApiError('too_large', 'photo', 413);
      const reading = await readWorkPhoto(target.sessionId, {
        item_id: itemId,
        photo_base64: base64,
      });
      if (current.current !== itemId) return;
      if (reading.status !== 'read') {
        setState({ step: 'failed', text: t(`practice:work.${reading.status}`) });
        return;
      }
      copy.current(fieldFrom(reading.lines));
      setState({ step: 'read', unread: reading.lines.includes(null) });
    } catch (err) {
      if (current.current !== itemId) return;
      // The question moved on meanwhile: the screen fetches what stands now.
      if (isOutdated(err) || (err instanceof ApiError && err.code === 'stale'))
        void queryClient.invalidateQueries({ queryKey: keys.session(target.sessionId) });
      const down = err instanceof ApiError && err.code === 'model_unavailable';
      setState({ step: 'failed', text: down ? t('practice:work.down') : messageFor(err) });
    }
  }

  async function take(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    const itemId = target.itemId;
    try {
      let uri: string | null;
      try {
        const shot = await openCamera();
        if (shot === 'blocked') {
          setState({ step: 'failed', text: t('practice:work.camera_blocked') });
          return;
        }
        uri = shot.canceled ? null : (shot.assets[0]?.uri ?? null);
      } catch {
        setState({ step: 'failed', text: t('practice:work.camera_failed') });
        return;
      }
      if (uri === null) return;
      setState({ step: 'reading' });
      const photo = await preparePhoto(uri, { base64: true }).catch(() => null);
      if (current.current !== itemId) return;
      if (!photo?.base64) {
        setState({ step: 'failed', text: t('capture:error.prepare', { count: 1 }) });
        return;
      }
      if (photo.problems.length > 0)
        setState({ step: 'checking', problems: photo.problems, base64: photo.base64 });
      else await read(photo.base64);
    } finally {
      busy.current = false;
    }
  }

  return {
    state,
    take: () => void take(),
    keep: () => {
      if (state.step === 'checking') void read(state.base64);
    },
    done: () => setState({ step: 'idle' }),
  };
}
