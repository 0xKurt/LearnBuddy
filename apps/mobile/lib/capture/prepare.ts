// A picked photo, made ready on the device (docs/architecture.md §Material): small but readable
// (longest side 1600 px, JPEG), and checked by the domain that takes the pages (lib/capture/
// pages.ts `PageHandler`, issue #107) — the learning domain looks for blur, light and tilt.
// Where the pages go from here is that domain's too (`start`).

import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { pageHandler, type PhotoProblem } from './pages.js';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;

export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** What the check on the device found (lib/capture/pages.ts); empty = looks fine. */
  problems: PhotoProblem[];
  /** The saved JPEG itself, when asked for: a photo of her working goes in the request (#444). */
  base64: string | null;
};

/**
 * Downscales a picked photo to a longest side of 1600 px (never upscales) and
 * saves it as JPEG. The size is read from the rendered image, which is already
 * upright, so the longer side is found whatever the camera's orientation was.
 * `base64`: the JPEG's bytes come back too — for a photo that is read in the request
 * instead of being uploaded (her working, issue #444).
 */
export async function preparePhoto(
  sourceUri: string,
  opts: { base64?: boolean } = {},
): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);
  const rendered: ImageRef[] = [];
  try {
    let image = await context.renderAsync();
    rendered.push(image);
    const originalMinSide = Math.min(image.width, image.height);
    if (Math.max(image.width, image.height) > MAX_SIDE) {
      context.resize(image.width >= image.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
      image = await context.renderAsync();
      rendered.push(image);
    }
    const saved = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
      base64: opts.base64 === true,
    });
    // A small copy for the quality check, measured right here on the device.
    let problems: PhotoProblem[] = [];
    const check = pageHandler.get()?.check;
    try {
      if (check) {
        if (image.width > check.width) context.resize({ width: check.width });
        const small = await context.renderAsync();
        rendered.push(small);
        const copy = await small.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.85,
          base64: true,
        });
        if (copy.base64) problems = check.run(copy.base64, originalMinSide);
      }
    } catch {
      // The check is advice: without it the photo is simply taken as it is.
    }
    return {
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      problems,
      base64: saved.base64 ?? null,
    };
  } finally {
    // Full-size bitmaps: free them now rather than whenever the GC runs.
    context.release();
    for (const r of rendered) r.release();
  }
}
