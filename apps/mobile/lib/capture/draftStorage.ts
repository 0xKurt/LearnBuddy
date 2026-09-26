// Where unsent photos live on a phone (lib/capture/draft.ts): the draft in
// AsyncStorage, the photos copied into the app's documents (the cache the image
// tools write to may be cleaned up by the system).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { createDraftStore, type DraftStorage } from './draft.js';

const DIR = 'lb-capture';

const storage: DraftStorage = {
  async read(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async write(key, value) {
    try {
      if (value === null) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, value);
    } catch {
      // Storage unavailable: the photos are still on the screen right now.
    }
  },
  async keep(uri) {
    try {
      const dir = new Directory(Paths.document, DIR);
      if (uri.startsWith(dir.uri)) return uri;
      dir.create({ intermediates: true, idempotent: true });
      const source = new File(uri);
      const target = new File(dir, source.name);
      if (!target.exists) source.copy(target);
      return target.uri;
    } catch {
      return uri; // Kept for this run at least.
    }
  },
  async drop(uris) {
    for (const uri of uris) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // Already gone.
      }
    }
  },
};

export const drafts = createDraftStore(storage);
