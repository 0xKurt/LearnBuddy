// Who she is is asked once, not on every screen she opens (#671 F14-c, #637). `/me` was fetched
// again by every screen that mounted after 15 s (Settings, its pages, the start guard), each time
// over the network. It changes only through her own actions in the app, which update or
// invalidate it, and through the server's refusals (new privacy text, deletion running), which
// invalidate it too (app/_layout.tsx). Five minutes is fresh enough for everything else.
// requires live verification in Claude Code session (stored device state and HTTP seam)

import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import * as endpoints from '../../../lib/api/endpoints.js';
import { queryClient, useMe } from '../../../lib/api/queries.js';
import * as session from '../../../lib/auth/session.js';
import * as storage from '../../../lib/api/cacheStorage.js';
import { toStored } from '../../../lib/api/deviceCache.js';
import { restoreCache } from '../../../lib/api/persist.js';
import { keys } from '../../../lib/api/keys.js';
import { MeResponse } from '@learnbuddy/shared-types/contracts';

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

it('refreshes a restored profile immediately while showing the stored copy (#913)', async () => {
  onlineManager.setOnline(true);
  const userId = '11111111-1111-4111-8111-111111111111';
  const stored = MeResponse.parse({
    account: null,
    learner: null,
    consent_version: '2026-09',
    capabilities: { model: true, push: false },
  });
  const fresh = { ...stored, consent_version: '2026-10' };
  vi.spyOn(session, 'currentSession').mockReturnValue({
    user_id: userId,
    access_token: 'local-test',
    refresh_token: 'local-test',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    email: 'restore@example.test',
  });
  vi.spyOn(storage, 'readCache').mockResolvedValue(
    JSON.stringify(toStored(userId, Date.now(), stored, undefined)),
  );
  const fetchMe = vi.spyOn(endpoints, 'getMe').mockResolvedValue(fresh);
  await restoreCache(userId);
  expect(queryClient.getQueryData(keys.me)).toEqual(stored);
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Screen />
    </QueryClientProvider>,
  );
  await act(async () => {});
  expect(fetchMe).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryData(keys.me)).toEqual(fresh);
  view.unmount();
});
