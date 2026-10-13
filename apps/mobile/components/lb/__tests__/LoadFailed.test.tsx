// The one "load failed → try again" of the screens (issue #311): her words for what went wrong,
// a retry that does what the screen says, and the second way on where the screen gives one.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/api/apiError.js';
import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { isGone, LoadFailed } from '../LoadFailed.js';

describe('LoadFailed', () => {
  it('says what went wrong in her words and tries again on a tap', () => {
    const onRetry = vi.fn();
    renderInApp(<LoadFailed error={new Error('fetch failed')} onRetry={onRetry} />);
    // Never the engine's words (lib/errors.ts): the app's own text stands as the heading.
    expect(screen.queryByText('fetch failed')).toBeNull();
    expect(screen.getByRole('heading').textContent).not.toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('takes no second tap while the retry is in flight', () => {
    const onRetry = vi.fn();
    renderInApp(<LoadFailed error={new ApiError('internal', 'x', 500)} busy onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('shows the second way on below the retry', () => {
    const back = vi.fn();
    renderInApp(
      <LoadFailed error={new Error('x')} onRetry={() => undefined}>
        <Btn variant="ghost" pill center onPress={back}>
          Zurück
        </Btn>
      </LoadFailed>,
    );
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Nochmal versuchen', 'Zurück']);
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  // A sheet that is gone offered "Nochmal versuchen" as its main action (#599): trying again
  // cannot bring it back, so the way on is the one thing offered.
  it('offers only the way back when the thing is gone — and says that it is', () => {
    const gone = new ApiError('not_found', 'x', 404);
    expect(isGone(gone)).toBe(true);
    expect(isGone(new ApiError('internal', 'x', 500))).toBe(false);
    const onPress = vi.fn();
    renderInApp(
      <LoadFailed error={gone} onRetry={() => undefined} back={{ label: 'Zurück', onPress }} />,
    );
    expect(screen.getByRole('heading').textContent).toBe('Das gibt es nicht mehr.');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Zurück']);
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offers the way back under the retry while trying again can still help', () => {
    renderInApp(
      <LoadFailed
        error={new ApiError('internal', 'x', 500)}
        onRetry={() => undefined}
        back={{ label: 'Zurück', onPress: () => undefined }}
      />,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Nochmal versuchen',
      'Zurück',
    ]);
  });

  // The start gate passes "Abmelden" as its second way on (app/index.tsx): that is no way back,
  // so a 404 there must not leave signing out as the only thing to do.
  it('keeps the retry for something gone where the screen gives no way back', () => {
    const gone = new ApiError('not_found', 'x', 404);
    const { unmount } = renderInApp(<LoadFailed error={gone} onRetry={() => undefined} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Nochmal versuchen']);
    unmount();
    renderInApp(
      <LoadFailed error={gone} onRetry={() => undefined}>
        <Btn variant="ghost" pill center onPress={() => undefined}>
          Abmelden
        </Btn>
      </LoadFailed>,
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Nochmal versuchen',
      'Abmelden',
    ]);
  });
});
