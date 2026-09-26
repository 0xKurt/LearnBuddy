// Uploading one photo on a phone: a native upload session that keeps going
// while the app is in the background (Lena switches to WhatsApp while it sends;
// the old app stopped then). iOS: a background URL session; Android: always.
import { File } from 'expo-file-system';
import { FileSystemSessionType, FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

import type { PutResult } from './putTypes.js';

export async function putPhoto(localUri: string, uploadUrl: string): Promise<PutResult> {
  try {
    const file = new File(localUri);
    if (!file.exists || file.size === 0) return { kind: 'file' };
  } catch {
    return { kind: 'file' };
  }
  try {
    const res = await uploadAsync(uploadUrl, localUri, {
      httpMethod: 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystemSessionType.BACKGROUND,
      headers: { 'content-type': 'image/jpeg' },
    });
    return { kind: 'response', status: res.status, body: res.body };
  } catch {
    return { kind: 'network' };
  }
}
