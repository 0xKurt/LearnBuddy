// Photo URI → 256-wide grayscale Uint8Array, for local quality scoring.
// Doc 05 §Capture ("Laplacian-variance score on a 256-px-wide grayscale
// downscale", "mean luminance").
//
// Pipeline: expo-image-manipulator (resize on-device, base64 out)
//   → jpeg-js decode to RGBA
//   → luminance projection to single-channel.
//
// jpeg-js is a pure-JS decoder, so this runs without a custom native module.
// Cost on a mid-range device is ~30–60 ms for a 256-wide frame, which is why
// the capture screen kicks this off async after the shutter rather than
// blocking the next press.

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';

import type { Grayscale } from './quality.js';

const TARGET_WIDTH = 256;

/** Resize the photo and return the decoded original-resolution dimensions
 *  alongside a grayscale buffer at the downscaled size. The caller hands
 *  `width`/`height` to `classify()` for the resolution gate; the buffer feeds
 *  `scoreBlur` / `scoreBrightness`. */
export async function decodeForQuality(
  uri: string,
  originalWidth: number,
  originalHeight: number,
): Promise<{ gray: Grayscale; width: number; height: number }> {
  const targetHeight = Math.max(1, Math.round((TARGET_WIDTH * originalHeight) / originalWidth));

  const result = await manipulateAsync(uri, [{ resize: { width: TARGET_WIDTH } }], {
    base64: true,
    compress: 0.85,
    format: SaveFormat.JPEG,
  });

  if (!result.base64) {
    throw new Error('decodeForQuality: manipulateAsync returned no base64');
  }

  const bytes = base64ToUint8Array(result.base64);
  const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false });

  const w = decoded.width;
  const h = decoded.height || targetHeight;
  const rgb = decoded.data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 3, j++) {
    const r = rgb[i] as number;
    const g = rgb[i + 1] as number;
    const b = rgb[i + 2] as number;
    gray[j] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }

  return {
    gray: { data: gray, width: w, height: h },
    width: originalWidth,
    height: originalHeight,
  };
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
