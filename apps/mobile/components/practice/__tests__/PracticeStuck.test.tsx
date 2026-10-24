import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api/apiError.js';
import { renderInApp } from '../../../testing/render.js';
import { PracticeStuck } from '../PracticeStuck.js';

describe('practice uses the shared load failure state', () => {
  it('does not repeat an in-flight retry', () => {
    const retry = vi.fn();
    renderInApp(
      <PracticeStuck
        error={new ApiError('internal', 'x', 500)}
        busy
        onRetry={retry}
        onBack={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }));
    expect(retry).not.toHaveBeenCalled();
  });
  it('shows gone and only the way back when the session was removed', () => {
    renderInApp(
      <PracticeStuck
        error={new ApiError('not_found', 'x', 404)}
        onRetry={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText('Das gibt es nicht mehr.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nochmal versuchen' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Zurück zu Buddy' })).toBeTruthy();
  });
  it('keeps the local ended message and a way back without a retry', () => {
    renderInApp(<PracticeStuck message="Diese Runde ist beendet." onBack={() => undefined} />);
    expect(screen.getByText('Diese Runde ist beendet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nochmal versuchen' })).toBeNull();
  });
});
