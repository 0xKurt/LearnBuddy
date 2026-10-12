import { act, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { Glow } from '../Glow.js';

it('removes the full-page decorative background when live Reduce Transparency changes', async () => {
  const changes: ((on: boolean) => void)[] = [];
  const listen = ((event: string, callback: unknown) => {
    if (event === 'reduceTransparencyChanged') changes.push(callback as (on: boolean) => void);
    return { remove: () => undefined };
  }) as typeof AccessibilityInfo.addEventListener;
  const listener = vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(listen);
  const view = renderInApp(<Glow />);
  await waitFor(() => expect(changes.length).toBeGreaterThan(0));
  expect(view.container.querySelector('svg')).toBeTruthy();
  act(() => changes.forEach((change) => change(true)));
  expect(view.container.querySelector('svg')).toBeNull();
  act(() => changes.forEach((change) => change(false)));
  expect(view.container.querySelector('svg')).toBeTruthy();
  listener.mockRestore();
});
