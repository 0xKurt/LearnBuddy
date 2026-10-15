// What the places of the ⋯ menu show is loaded while she looks at the menu (#711, #637). Measured
// on the POCO X3: the first open of the settings waited ~3.8 s for `GET /buddy/settings` after the
// tap (the server answers in 12 ms; the rest is the phone's request), "Dein Material" the same for
// its library. The menu stands open for a moment before she taps — that moment now carries the
// requests, so the place opens with its content.

import { onlineManager } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as endpoints from '../../../lib/api/endpoints.js';
import { keys, queryClient } from '../../../lib/api/queries.js';
import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp } from '../../../testing/render.js';
import { HeaderMenu } from '../HeaderMenu.js';

vi.mock('../../../lib/capture/attachRequest.js', () => ({
  askAttach: vi.fn(),
  attachInChat: vi.fn(),
}));

// The app as it runs: the learning domain adds its library (app/_layout.tsx).
registerLearning();

const never = <T,>() => new Promise<T>(() => undefined);

beforeEach(() => {
  onlineManager.setOnline(true);
  vi.spyOn(endpoints, 'getSettings').mockImplementation(never);
  vi.spyOn(endpoints, 'getMe').mockImplementation(never);
  vi.spyOn(endpoints, 'getLibrary').mockImplementation(never);
});
afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

it('loads the settings, her profile and her library when the menu opens, not before', async () => {
  const view = renderInApp(<HeaderMenu visible={false} onClose={() => undefined} />);
  await act(async () => {});
  expect(endpoints.getSettings).not.toHaveBeenCalled();
  expect(endpoints.getLibrary).not.toHaveBeenCalled();

  view.rerender(<HeaderMenu visible onClose={() => undefined} />);
  await act(async () => {});
  expect(endpoints.getSettings).toHaveBeenCalledTimes(1);
  expect(endpoints.getMe).toHaveBeenCalledTimes(1);
  expect(endpoints.getLibrary).toHaveBeenCalledTimes(1);
});

it('asks nothing again for what is already fresh', async () => {
  queryClient.setQueryData(keys.settings, {});
  const view = renderInApp(<HeaderMenu visible onClose={() => undefined} />);
  await act(async () => {});
  view.rerender(<HeaderMenu visible={false} onClose={() => undefined} />);
  view.rerender(<HeaderMenu visible onClose={() => undefined} />);
  await act(async () => {});
  // Each asked once over both openings: the second finds the first one's answer (or request).
  expect(endpoints.getSettings).not.toHaveBeenCalled();
  expect(endpoints.getLibrary).toHaveBeenCalledTimes(1);
  expect(endpoints.getMe).toHaveBeenCalledTimes(1);
});
