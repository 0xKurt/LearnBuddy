import { describe, expect, it } from 'vitest';

import {
  afterSend,
  failureOf,
  OUTBOX_MAX,
  parseOutbox,
  withEntry,
  without,
  type OutboxEntry,
} from '../outbox.js';

const entry = (id: string, savedAt = '2026-09-25T10:00:00Z'): OutboxEntry => ({
  sessionId: 's1',
  body: { client_turn_id: id, item_id: 'i1', text: 'Nenner' },
  savedAt,
});

describe('outbox', () => {
  it('keeps one entry per client_turn_id and drops the oldest when full', () => {
    let list = withEntry([], entry('a'));
    list = withEntry(list, entry('a'));
    expect(list).toHaveLength(1);
    for (let i = 0; i < OUTBOX_MAX + 5; i++) list = withEntry(list, entry(`x${i}`));
    expect(list).toHaveLength(OUTBOX_MAX);
    expect(list[0]?.body.client_turn_id).toBe('x5');
    expect(without(list, 'x5')).toHaveLength(OUTBOX_MAX - 1);
  });

  it('reads back only well-formed, recent entries', () => {
    const now = new Date('2026-09-26T10:00:00Z');
    const raw = JSON.stringify([
      entry('ok'),
      entry('old', '2026-09-01T10:00:00Z'),
      { sessionId: 's1', body: { text: 'x' }, savedAt: '2026-09-25T10:00:00Z' },
      'nonsense',
    ]);
    expect(parseOutbox(raw, now).map((e) => e.body.client_turn_id)).toEqual(['ok']);
    expect(parseOutbox('not json', now)).toEqual([]);
    expect(parseOutbox(null, now)).toEqual([]);
  });

  it('keeps an answer only while there is no connection', () => {
    expect(afterSend('no_connection')).toBe('keep');
    expect(afterSend('sent')).toBe('remove');
    expect(afterSend('refused')).toBe('remove');
    expect(afterSend('try_later')).toBe('keep');
  });

  it('drops an answer only when the API clearly refuses it', () => {
    expect(failureOf('network', 0)).toBe('no_connection');
    expect(failureOf('conflict', 409)).toBe('refused');
    expect(failureOf('not_found', 404)).toBe('refused');
    expect(failureOf('invalid_input', 400)).toBe('refused');
    // Server trouble, an expired login, a proxy page: kept for later.
    expect(failureOf('internal', 500)).toBe('try_later');
    expect(failureOf('internal', 503)).toBe('try_later');
    expect(failureOf('unauthorized', 401)).toBe('try_later');
    expect(failureOf('rate_limited', 429)).toBe('try_later');
    expect(failureOf('invalid_response', 200)).toBe('try_later');
  });
});
