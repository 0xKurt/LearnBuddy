import { describe, expect, it } from 'vitest';

import {
  EMPTY_QUEUE,
  OPENED_MAX,
  outreachIdOf,
  parsePushQueue,
  withOpened,
  withoutOpened,
  withRelease,
} from '../pushQueue.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-09-28T10:00:00Z');

describe('push queue (M-64, M-65)', () => {
  it('keeps an opened report across a restart until it is sent', () => {
    const q = withOpened(EMPTY_QUEUE, id(1), now);
    const back = parsePushQueue(JSON.stringify(q), now);
    expect(back.opened.map((e) => e.id)).toEqual([id(1)]);
    expect(withoutOpened(back, id(1)).opened).toEqual([]);
  });

  it('reports each message once, and bounds the queue', () => {
    let q = withOpened(EMPTY_QUEUE, id(1), now);
    q = withOpened(q, id(1), now);
    expect(q.opened).toHaveLength(1);
    for (let i = 2; i < OPENED_MAX + 5; i++) q = withOpened(q, id(i), now);
    expect(q.opened).toHaveLength(OPENED_MAX);
  });

  it('drops week-old reports and anything malformed', () => {
    const q = withOpened(EMPTY_QUEUE, id(1), new Date('2026-09-10T10:00:00Z'));
    expect(parsePushQueue(JSON.stringify(q), now).opened).toEqual([]);
    expect(parsePushQueue('not json', now)).toEqual(EMPTY_QUEUE);
    expect(parsePushQueue('{"opened":[{"id":"x","at":"y"}]}', now)).toEqual(EMPTY_QUEUE);
  });

  it('remembers a release that could not reach the server', () => {
    const q = withRelease(EMPTY_QUEUE, true);
    expect(parsePushQueue(JSON.stringify(q), now).release).toBe(true);
    expect(withRelease(q, false).release).toBe(false);
  });

  it('reads only Buddy’s notifications', () => {
    expect(outreachIdOf({ type: 'buddy_outreach', outreach_id: id(3) })).toBe(id(3));
    expect(outreachIdOf({ type: 'other', outreach_id: id(3) })).toBeNull();
    expect(outreachIdOf({ type: 'buddy_outreach', outreach_id: 'x' })).toBeNull();
    expect(outreachIdOf(null)).toBeNull();
  });
});
