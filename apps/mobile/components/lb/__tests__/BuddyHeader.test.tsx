import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { SPACE } from '../../../lib/theme/space.js';
import { renderInApp } from '../../../testing/render.js';
import { BuddyHeader } from '../BuddyHeader.js';

vi.mock('../BuddyOrb.js', () => ({ BuddyOrb: () => null }));

it('retains the full accessible title and caller navigation while showing one real progress indicator', () => {
  const title = 'Ein langer Titel für die nächste Übung mit vielen Wörtern';
  const back = vi.fn();
  renderInApp(
    <BuddyHeader
      title={title}
      subtitle="2 von 5"
      leading={{ icon: 'back', label: 'Zurück', onPress: back }}
      progress={{ total: 5, current: 1, label: 'Übungsfortschritt' }}
    />,
  );
  expect(screen.getByRole('heading', { name: title }).textContent).toBe(title);
  expect(screen.getByText('2 von 5')).toBeTruthy();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('5');
  fireEvent.click(screen.getByRole('button', { name: 'Zurück' }));
  expect(back).toHaveBeenCalledTimes(1);
});

it('places caller timer/footer and progress in the same inset slot', () => {
  renderInApp(
    <BuddyHeader
      title="Übung"
      footer={<span>Timer 2:00</span>}
      progress={{ total: 4, current: 1, label: 'Fortschritt' }}
    />,
  );
  const slot = screen.getByTestId('buddy-header-footer');
  expect(slot.contains(screen.getByText('Timer 2:00'))).toBe(true);
  expect(slot.contains(screen.getByRole('progressbar'))).toBe(true);
  expect(slot.style.paddingLeft).toBe(`${SPACE.sm}px`);
  expect(slot.style.paddingRight).toBe(`${SPACE.sm}px`);
});
