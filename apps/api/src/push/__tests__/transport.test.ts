import { describe, expect, it } from 'vitest';

import { ExpoPush } from '../transport.js';

describe('ExpoPush payload', () => {
  it('targets the Android channel the app creates (p2-uf-android-channel-never-targeted)', async () => {
    let sent: unknown = null;
    const push = new ExpoPush(undefined, async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 't1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    await push.send([{ to: 'ExponentPushToken[x]', title: 'T', body: 'B', data: {} }]);
    expect(sent).toEqual([expect.objectContaining({ channelId: 'buddy' })]);
  });

  it('carries the message expiry, so a phone that was off gets no stale message (p2-push-no-ttl-default-priority)', async () => {
    let sent: unknown = null;
    const push = new ExpoPush(undefined, async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 't1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    await push.send([
      {
        to: 'ExponentPushToken[x]',
        title: 'T',
        body: 'B',
        data: {},
        expiresAt: new Date('2026-09-28T18:00:00Z'),
      },
    ]);
    expect(sent).toEqual([expect.objectContaining({ expiration: 1790618400 })]);
  });
});
