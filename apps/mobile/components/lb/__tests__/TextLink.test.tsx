import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { TOUCH } from '../../../lib/theme/space.js';
import { TextLink } from '../TextLink.js';
it('gives a short material link a full touch target while retaining its label and navigation callback', () => {
  const navigate = vi.fn();
  renderInApp(
    <TextLink onPress={navigate} accessibilityLabel="Material öffnen">
      A
    </TextLink>,
  );
  const link = screen.getByRole('button', { name: 'Material öffnen' });
  const style = getComputedStyle(link);
  expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(TOUCH);
  expect(Number.parseFloat(style.minWidth)).toBeGreaterThanOrEqual(TOUCH);
  fireEvent.click(link);
  expect(navigate).toHaveBeenCalledTimes(1);
});
it('keeps a noninteractive context line compact and out of the button sequence', () => {
  renderInApp(<TextLink>Mathe</TextLink>);
  expect(screen.queryByRole('button')).toBeNull();
  const parent = screen.getByText('Mathe').parentElement!;
  expect(Number.parseFloat(getComputedStyle(parent).minHeight) || 0).toBeLessThan(TOUCH);
  expect(Number.parseFloat(getComputedStyle(parent).minWidth) || 0).toBeLessThan(TOUCH);
});
