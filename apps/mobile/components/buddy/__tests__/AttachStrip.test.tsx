// The square above the field that shows the page she is about to send (issue #294).
//
// On the phone it stayed an empty dark box — measured, not guessed: pixel-identical after ten
// seconds — while the same file showed at once in the card after sending. An empty box with a ✕
// looks like a fault, and this is the one moment she can still check she took the right page.
//
// What this layer sees: what the tile is made of — the photo with its name, the mark under it,
// the words when it cannot be shown, and which view carries the shadow and which one clips.
// Whether Android then paints the pixels is the device's (the issue asks for a measurement on
// the phone); whether the tile is not one flat colour in the browser is tests/web/visible.spec.ts.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { AttachStrip } from '../AttachStrip.js';

const PHOTO = 'file:///data/user/0/app/files/lb-capture/page-1.jpg';

function strip(props: Partial<Parameters<typeof AttachStrip>[0]> = {}) {
  return renderInApp(
    <AttachStrip
      uris={[PHOTO]}
      pdfs={{}}
      flagged={new Set()}
      disabled={false}
      onRemove={() => undefined}
      {...props}
    />,
  );
}

/** The <img> react-native-web renders for the photo. */
function photoImg(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector('img');
  if (!img) throw new Error('no image in the tile');
  return img;
}

describe('the attached photo above the field (#294)', () => {
  it('shows the photo itself, under its name', () => {
    const { container } = strip();
    expect(screen.getAllByLabelText('Foto 1 von 1').length).toBeGreaterThan(0);
    expect(photoImg(container).getAttribute('src')).toBe(PHOTO);
  });

  it('gives the photo the tile’s full size, not a size it has to inherit', () => {
    const { container } = strip();
    // The thumbnails that show on the phone are sized; the empty one was `flex: 1` inside a
    // pressable inside the clipping view.
    let box: HTMLElement | null = photoImg(container);
    while (box && styleOf(box).width !== '72px') box = box.parentElement;
    expect(box, 'a 72 px box around the photo below the tile').not.toBeNull();
    expect(styleOf(box!).height).toBe('72px');
    expect(screen.getByTestId('attach-tile').contains(box)).toBe(true);
    expect(box).not.toBe(screen.getByTestId('attach-tile'));
  });

  it('keeps the clipping and the shadow on two views, like the thumbnails that do show', () => {
    strip();
    const tile = screen.getByTestId('attach-tile');
    const clip = styleOf(tile);
    expect([clip.overflow, clip.overflowX, clip.overflowY]).toContain('hidden');
    expect(styleOf(tile).boxShadow).toBe('');
    expect(styleOf(tile.parentElement!).boxShadow).not.toBe('');
  });

  it('is never an empty box: a mark lies under the photo until it paints', () => {
    strip();
    const tile = screen.getByTestId('attach-tile');
    // The camera mark is drawn before the photo, so the photo covers it once it is there.
    const svg = tile.querySelector('svg');
    const img = tile.querySelector('img');
    expect(svg).not.toBeNull();
    expect(img).not.toBeNull();
    expect(svg!.compareDocumentPosition(img!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says it in words when the photo cannot be shown', () => {
    const { container } = strip();
    expect(screen.queryByText('Vorschau nicht möglich')).toBeNull();
    fireEvent.error(photoImg(container));
    expect(screen.getByText('Vorschau nicht möglich')).toBeTruthy();
    expect(screen.getByLabelText('Foto 1 von 1: Vorschau nicht möglich')).toBeTruthy();
    // It can still be taken out again.
    expect(screen.getByRole('button', { name: 'Foto 1 entfernen' })).toBeTruthy();
  });

  it('says nothing of a preview for a PDF, which has none', () => {
    strip({ uris: ['file:///x/plan.pdf'], pdfs: { 'file:///x/plan.pdf': 'plan.pdf' } });
    expect(screen.getByText('plan.pdf')).toBeTruthy();
    expect(screen.queryByText('Vorschau nicht möglich')).toBeNull();
  });
});
