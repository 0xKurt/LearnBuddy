// A PDF from the file picker or another app gets its own file in the app's cache (two
// shares both called "Arbeitsblatt.pdf" stay two files); the draft then keeps it
// (lib/capture/draftStorage.ts). The browser version is fileCopy.web.ts.
import { File, Paths } from 'expo-file-system';

import { newId } from '../api/client.js';

export async function ownCopy(uri: string, ext: 'pdf'): Promise<string> {
  const source = new File(uri);
  const target = new File(Paths.cache, `lb-${newId()}.${ext}`);
  source.copy(target);
  return target.uri;
}

/** The size in bytes, when the file says (null when unknown). */
export function sizeOf(uri: string): number | null {
  try {
    const f = new File(uri);
    return f.exists ? f.size : null;
  } catch {
    return null;
  }
}
