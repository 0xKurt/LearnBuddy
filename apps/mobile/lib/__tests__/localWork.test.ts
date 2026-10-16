// Whose kept answers go out (#822 review): only once this sign-in proved they are hers. When the
// phone cannot say whose they are, they stay untouched and unsent — never sent under her account.

import type { AnswerResponse } from '@learnbuddy/shared-types/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let outbox: string | null = null;
vi.mock('../api/outboxStorage.js', () => ({
  readOutbox: () => Promise.resolve(outbox),
  writeOutbox: (v: string | null) => {
    outbox = v;
    return Promise.resolve();
  },
}));
let owner: () => Promise<string | null> = () => Promise.resolve(null);
vi.mock('../auth/session.js', () => ({
  localOwner: () => owner(),
  setLocalOwner: () => Promise.resolve(),
}));
vi.mock('../capture/draftStorage.js', () => ({
  drafts: { clearAll: () => Promise.resolve(), load: () => Promise.resolve(null) },
}));
vi.mock('../drafts.js', () => ({ clearDrafts: () => Promise.resolve() }));
// The request client loads Expo; the outbox only needs its error type.
vi.mock('../api/client.js', () => ({ ApiError: class ApiError extends Error {} }));

const { flushOutbox, keepAnswer, outboxBelongsTo } = await import('../api/outboxSync.js');
const { adoptLocalWork } = await import('../localWork.js');

const sent: string[] = [];
const send = (_session: string, body: { client_turn_id: string }) => {
  sent.push(body.client_turn_id);
  return Promise.resolve({} as AnswerResponse);
};
const flush = () => flushOutbox(send, () => undefined);

beforeEach(async () => {
  outbox = null;
  sent.length = 0;
  outboxBelongsTo(null);
  await keepAnswer('s1', { client_turn_id: 't1', item_id: 'i1', text: 'Nenner' });
});

describe('kept answers and whose they are', () => {
  it('sends nothing when whose they are cannot be read, and keeps them for the next start', async () => {
    owner = () => Promise.reject(new Error('storage'));
    await expect(adoptLocalWork('u2')).rejects.toThrow('storage');
    await flush();
    expect(sent).toEqual([]);
    expect(outbox).toContain('t1');
  });

  it('sends nothing before a sign-in adopted them', async () => {
    await flush();
    expect(sent).toEqual([]);
  });

  it('sends hers once adopted, and never another person’s', async () => {
    owner = () => Promise.resolve('u1');
    await adoptLocalWork('u1');
    await flush();
    expect(sent).toEqual(['t1']);

    await keepAnswer('s1', { client_turn_id: 't2', item_id: 'i1', text: 'Zähler' });
    await adoptLocalWork('u2');
    await flush();
    expect(sent).toEqual(['t1']);
    expect(outbox).toBeNull();
  });
});
