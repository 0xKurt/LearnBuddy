import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { StartStatus } from '../StartStatus.js';

it('leaves the waiting state to the busy action when one is already shown', () => {
  renderInApp(<StartStatus state={{ status: 'preparing' }} preparingInAction />);
  expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
  expect(screen.queryByText('Buddy bereitet vor …')).toBeNull();
});
it('shows the shared busy state when it is the only waiting indicator', () => {
  renderInApp(<StartStatus state={{ status: 'preparing' }} />);
  expect(screen.getAllByRole('progressbar', { hidden: true })).toHaveLength(1);
});
