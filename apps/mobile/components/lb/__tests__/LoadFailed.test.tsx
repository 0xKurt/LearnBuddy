// The one "load failed → try again" of the screens (issue #311): her words for what went wrong,
// a retry that does what the screen says, and the second way on where the screen gives one.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../../lib/api/apiError.js';
import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { LoadFailed } from '../LoadFailed.js';

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
});
