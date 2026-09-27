// Runs the outbox (lib/api/outbox.ts): keep an answer before sending, drop it
// once the API has it, and send what is left on start and when back online.
import type { AnswerRequest, AnswerResponse } from '@learnbuddy/shared-types/contracts';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from './client.js';
import { oneRunAndAnother, sendInOrder, type PassResult } from './flush.js';
import { failureOf, parseOutbox, withEntry, without, type SendResult } from './outbox.js';
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

/** Answers still waiting to be sent. */
export async function hasKeptAnswers(): Promise<boolean> {
  return (await serial(load)).length > 0;
}

export function clearOutbox(): Promise<void> {
  return serial(() => writeOutbox(null));
}

export function resultOf(err: unknown): SendResult {
  return err instanceof ApiError ? failureOf(err.code, err.status) : 'try_later';
}

// Answers being sent right now by the practice screen: a flush leaves them
// alone, so one answer never goes out twice at the same moment.
const live = new Set<string>();

/** Sends one answer live; the outbox skips it meanwhile. */
export async function sendingLive<T>(clientTurnId: string, fn: () => Promise<T>): Promise<T> {
  live.add(clientTurnId);
  try {
    return await fn();
  } finally {
    live.delete(clientTurnId);
  }
}

/**
 * Sends every kept answer once (oldest first). `send` is the plain request;
 * `onSent` lets the app refresh that session. A connection loss ends the pass;
 * trouble with one answer does not hold back the others (lib/api/flush.ts).
 * One flush at a time; a call meanwhile gets one more pass after it.
 * Resolves with how many were sent and how many the API refused for good
 * (question closed, session ended — dropped, and the app says so).
 */
export function flushOutbox(
  send: (sessionId: string, body: AnswerRequest) => Promise<AnswerResponse>,
  onSent: (sessionId: string) => void,
): Promise<PassResult> {
  latest = { send, onSent };
  return flush();
}

let latest: {
  send: (sessionId: string, body: AnswerRequest) => Promise<AnswerResponse>;
  onSent: (sessionId: string) => void;
} | null = null;

const flush = oneRunAndAnother(async (): Promise<PassResult> => {
  const how = latest;
  if (!how || !onlineManager.isOnline()) return { sent: 0, refused: 0 };
  const list = (await serial(load)).filter((e) => !live.has(e.body.client_turn_id));
  return sendInOrder(
    list,
    async (e) => {
      try {
        await how.send(e.sessionId, e.body);
        return 'sent';
      } catch (err) {
        return resultOf(err);
      }
    },
    async (e, result) => {
      await dropAnswer(e.body.client_turn_id);
      if (result === 'sent') how.onSent(e.sessionId);
    },
  );
});
