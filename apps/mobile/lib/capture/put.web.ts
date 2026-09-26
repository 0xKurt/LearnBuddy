// Uploading one photo in the browser: a plain PUT (no background sessions there).
import type { PutResult } from './putTypes.js';

export async function putPhoto(localUri: string, uploadUrl: string): Promise<PutResult> {
  let body: Blob;
  try {
    body = await (await fetch(localUri)).blob();
  } catch {
    return { kind: 'file' };
  }
  if (body.size === 0) return { kind: 'file' };
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body,
    });
    return { kind: 'response', status: res.status, body: res.ok ? '' : await res.text() };
  } catch {
    return { kind: 'network' };
  }
}
