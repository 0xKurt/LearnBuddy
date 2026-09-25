// Runs the outbox (lib/api/outbox.ts): keep an answer before sending, drop it
// once the API has it, and send what is left on start and when back online.
import type { AnswerRequest, AnswerResponse } from '@learnbuddy/shared-types/contracts';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from './client.js';
import { afterSend, parseOutbox, withEntry, without, type SendResult } from './outbox.js';
import { readOutbox, writeOutbox } from './outboxStorage.js';

// One writer at a time, so two answers saved at once never overwrite each other.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

async function load() {
  return parseOutbox(await readOutbox(), new Date());
}

export function keepAnswer(sessionId: string, body: AnswerRequest): Promise<void> {
  return serial(async () => {
    const list = withEntry(await load(), { sessionId, body, savedAt: new Date().toISOString() });
    await writeOutbox(JSON.stringify(list));
  });
}

export function dropAnswer(clientTurnId: string): Promise<void> {
  return serial(async () => {
    const list = without(await load(), clientTurnId);
    await writeOutbox(list.length ? JSON.stringify(list) : null);
  });
}

export function clearOutbox(): Promise<void> {
  return serial(() => writeOutbox(null));
}

export function resultOf(err: unknown): SendResult {
  return err instanceof ApiError && err.code === 'network' ? 'no_connection' : 'refused';
}

/**
 * Sends every kept answer once (oldest first). `send` is the plain request;
 * `onSent` lets the app refresh that session. Stops at the first missing connection.
 */
export async function flushOutbox(
  send: (sessionId: string, body: AnswerRequest) => Promise<AnswerResponse>,
  onSent: (sessionId: string) => void,
): Promise<number> {
  if (!onlineManager.isOnline()) return 0;
  const list = await serial(load);
  let sent = 0;
  for (const e of list) {
    let result: SendResult = 'sent';
    try {
      await send(e.sessionId, e.body);
    } catch (err) {
      result = resultOf(err);
    }
    if (afterSend(result) === 'keep') break;
    await dropAnswer(e.body.client_turn_id);
    if (result === 'sent') {
      sent += 1;
      onSent(e.sessionId);
    }
  }
  return sent;
}
