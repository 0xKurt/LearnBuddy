// Where unsent photos live in the browser (lib/capture/draft.ts): localStorage,
// the photos as data URLs (a blob URL does not survive a reload). A photo too
// big for the storage is simply not kept past a reload.
import { createDraftStore, type DraftStorage } from './draft.js';

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

const storage: DraftStorage = {
  async read(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async write(key, value) {
    try {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // Full or unavailable: the photos are still on the screen right now.
    }
  },
  async keep(uri) {
    if (uri.startsWith('data:')) return uri;
    try {
      // The same picture twice must still be two photos: a fragment makes each one its own
      // (fetch and <img> ignore it).
      const id = Math.random().toString(36).slice(2, 10);
      return `${await toDataUrl(await (await fetch(uri)).blob())}#${id}`;
    } catch {
      return uri;
    }
  },
  async drop() {
    // Data URLs live inside the stored draft: nothing else to delete.
  },
};

export const drafts = createDraftStore(storage);
