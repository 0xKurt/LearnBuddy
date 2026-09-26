// The photo check on the device (lib/photo/quality.ts): a small copy of the
// prepared photo is decoded here (jpeg-js, pure JS: the same on phone and web)
// and measured. A failure of the check itself never stops the photo.
import { decode } from 'jpeg-js';

import { assessPixels, type PhotoProblem } from './quality.js';

function bytesOf(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** What is wrong with a photo, from a small JPEG copy (base64) and the original's shorter side. */
export function checkPhoto(smallJpegBase64: string, originalMinSide: number): PhotoProblem[] {
  try {
    const img = decode(bytesOf(smallJpegBase64), { useTArray: true, maxMemoryUsageInMB: 64 });
    return assessPixels(img.data, img.width, img.height, originalMinSide).problems;
  } catch {
    return [];
  }
}
