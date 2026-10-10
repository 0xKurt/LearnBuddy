// A photographed page for tests that crop for real (concept images, issue #50): white paper with a
// dark block, as a JPEG, so sharp has something to crop. Test tooling only.
// requires live verification in Claude Code session (an in-test stand-in for a camera photo)

import sharp from 'sharp';

/** A real photographed-page stand-in: white paper with a dark block, as a JPEG. */
export async function pageJpeg(): Promise<Uint8Array> {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 250, g: 250, b: 248 } },
  })
    .composite([
      {
        input: {
          create: { width: 120, height: 90, channels: 3, background: { r: 20, g: 20, b: 24 } },
        },
        left: 40,
        top: 30,
      },
    ])
    .jpeg()
    .toBuffer();
}
