// Who she is is asked once, not on every screen she opens (#671 F14-c, #637). `/me` was fetched
// again by every screen that mounted after 15 s (Settings, its pages, the start guard), each time
// over the network. It changes only through her own actions in the app, which update or
// invalidate it, and through the server's refusals (new privacy text, deletion running), which
// invalidate it too (app/_layout.tsx). Five minutes is fresh enough for everything else.

import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import * as endpoints from '../../../lib/api/endpoints.js';
import { queryClient, useMe } from '../../../lib/api/queries.js';

afterEach(() => {
  queryClient.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function Screen() {
  useMe();
  return null;
}

it('asks /me once for screens opened within five minutes, and again after', async () => {
  onlineManager.setOnline(true);
  vi.useFakeTimers({ toFake: ['Date'] });
  const me = vi
    .spyOn(endpoints, 'getMe')
    .mockResolvedValue({} as Awaited<ReturnType<typeof endpoints.getMe>>);
  const open = async () => {
    const view = render(
      <QueryClientProvider client={queryClient}>
        <Screen />
      </QueryClientProvider>,
    );
    await act(async () => {});
    view.unmount();
  };
  await open();
  expect(me).toHaveBeenCalledTimes(1);
  // Settings, then one of its pages, a minute and four minutes later.
  vi.setSystemTime(Date.now() + 60_000);
  await open();
  vi.setSystemTime(Date.now() + 3 * 60_000);
  await open();
  expect(me).toHaveBeenCalledTimes(1);
  vi.setSystemTime(Date.now() + 2 * 60_000);
  await open();
  expect(me).toHaveBeenCalledTimes(2);
});
