// Prefetch is not an open (#868); even a fresh or in-flight cache must report the actual tap.
// requires live verification in Claude Code session — HTTP is the only replaced seam.
import type { NowCard, SessionView } from '@learnbuddy/shared-types/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as client from '../../../lib/api/client.js';
import { queryClient } from '../../../lib/api/queries.js';
import { usePracticeSession, usePrefetchSession } from '../../../lib/api/sessionQueries.js';

const ID = '00000000-0000-4000-8000-000000000001';
const card: NowCard = {
  type: 'resume_practice',
  session_id: ID,
  mode: 'practice',
  title: 'Brüche',
  remaining: 1,
};
const view = { id: ID, preparing: false, items: [{ status: 'open' }] } as unknown as SessionView;
const request = vi.spyOn(client, 'request');

beforeEach(() => {
  queryClient.clear();
  request.mockReset().mockResolvedValue(view);
});
afterEach(() => {
  queryClient.clear();
});
afterAll(() => vi.restoreAllMocks());

function Home() {
  usePrefetchSession(card);
  return null;
}
function Run() {
  usePracticeSession(ID);
  return null;
}
const opens = () =>
  request.mock.calls.filter(([method, path]) => method === 'POST' && path.endsWith('/open'));

it.each([false, true])(
  'reports an open independently of a prefetched request still running: %s',
  async (pending) => {
    let finish!: (value: SessionView) => void;
    const held = new Promise<SessionView>((resolve) => {
      finish = resolve;
    });
    if (pending) request.mockImplementationOnce(() => held);
    const home = render(<Home />);
    await waitFor(() => expect(request).toHaveBeenCalled());
    if (!pending) await act(async () => {});
    expect(opens()).toHaveLength(0);
    home.unmount();

    const run = render(
      <QueryClientProvider client={queryClient}>
        <Run />
      </QueryClientProvider>,
    );
    try {
      await waitFor(() => expect(opens()).toHaveLength(1));
      run.rerender(
        <QueryClientProvider client={queryClient}>
          <Run />
        </QueryClientProvider>,
      );
      expect(opens()).toHaveLength(1);
    } finally {
      await act(async () => finish(view));
      run.unmount();
    }
  },
);
