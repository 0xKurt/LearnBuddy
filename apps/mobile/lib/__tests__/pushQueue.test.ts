import { describe, expect, it } from 'vitest';

import { pressOf } from '../pushActions.js';
import {
  afterPress,
  EMPTY_QUEUE,
  OPENED_MAX,
  outreachIdOf,
  parsePushQueue,
  withAction,
  withOpened,
  withoutAction,
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

  it('keeps a pressed button across a restart until the API has it, once per message and button', () => {
    let q = withAction(EMPTY_QUEUE, id(1), 'not_today', now);
    q = withAction(q, id(1), 'not_today', now);
    q = withAction(q, id(1), 'less_often', now);
    const back = parsePushQueue(JSON.stringify(q), now);
    expect(back.actions.map((e) => [e.id, e.action])).toEqual([
      [id(1), 'not_today'],
      [id(1), 'less_often'],
    ]);
    expect(withoutAction(back, id(1), 'not_today').actions.map((e) => e.action)).toEqual([
      'less_often',
    ]);
  });

  it('reports "geöffnet" only where the app really came to the front (rule 5)', () => {
    // The notification itself: she opened Buddy.
    const tapped = afterPress(EMPTY_QUEUE, id(1), pressOf('default'), now);
    expect(tapped.opened.map((e) => e.id)).toEqual([id(1)]);
    expect(tapped.actions).toEqual([]);

    // "Jetzt üben" opens the app — the press and the opening are both true.
    const practice = afterPress(EMPTY_QUEUE, id(2), pressOf('lb.practice_now'), now);
    expect(practice.actions.map((e) => e.action)).toEqual(['practice_now']);
    expect(practice.opened.map((e) => e.id)).toEqual([id(2)]);

    // From the lock screen: the press is reported, "geöffnet" is not claimed.
    for (const identifier of ['lb.not_today', 'lb.less_often']) {
      const q = afterPress(EMPTY_QUEUE, id(3), pressOf(identifier), now);
      expect(q.actions).toHaveLength(1);
      expect(q.opened).toEqual([]);
    }
  });

  it('reads a queue from an older version (no buttons yet), and drops presses a week old', () => {
    const old = JSON.stringify({ opened: [], release: true });
    expect(parsePushQueue(old, now)).toEqual({ opened: [], actions: [], release: true });
    const q = withAction(EMPTY_QUEUE, id(2), 'less_often', new Date('2026-09-10T10:00:00Z'));
    expect(parsePushQueue(JSON.stringify(q), now).actions).toEqual([]);
  });
});
