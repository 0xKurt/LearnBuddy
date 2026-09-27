import { onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';

import { sendWhenOnline, WaitAborted, whenOnline } from '../whenOnline.js';

class Offline extends Error {}
const isConnectionError = (err: unknown) => err instanceof Offline;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('whenOnline', () => {
  it('resolves at once when online', async () => {
    onlineManager.setOnline(true);
    await expect(whenOnline()).resolves.toBeUndefined();
  });

  it('waits until the device is back online', async () => {
    onlineManager.setOnline(false);
    let done = false;
    const waiting = whenOnline().then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);
    onlineManager.setOnline(true);
    await waiting;
    expect(done).toBe(true);
  });
});

describe('cancelling the wait (M-35 speak-offline-wait-no-cancel)', () => {
  it('gives up waiting when she cancels, and never sends', async () => {
    onlineManager.setOnline(false);
    const controller = new AbortController();
    let sent = 0;
    const result = sendWhenOnline(
      async () => {
        sent += 1;
        return 'ok';
      },
      { isConnectionError, signal: controller.signal },
    );
    await tick();
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(WaitAborted);
    onlineManager.setOnline(true);
    await tick();
    expect(sent).toBe(0);
  });

  it('rejects at once for a signal that is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(whenOnline(controller.signal)).rejects.toBeInstanceOf(WaitAborted);
  });
});

describe('sendWhenOnline', () => {
  it('does not send while offline and sends the same request once back', async () => {
    onlineManager.setOnline(false);
    const bodies: string[] = [];
    const body = 'client_turn_id=t1';
    const result = sendWhenOnline(
      async () => {
        bodies.push(body);
        return 'ok';
      },
      { isConnectionError, delayMs: 0 },
    );
    await tick();
    expect(bodies).toEqual([]);
    onlineManager.setOnline(true);
    await expect(result).resolves.toBe('ok');
    expect(bodies).toEqual(['client_turn_id=t1']);
  });

  it('waits again when the connection drops during the request', async () => {
    onlineManager.setOnline(true);
    let calls = 0;
    const result = sendWhenOnline(
      async () => {
        calls += 1;
        if (calls === 1) {
          onlineManager.setOnline(false);
          throw new Offline();
        }
        return 'ok';
      },
      { isConnectionError, attempts: 1, delayMs: 0 },
    );
    await tick();
    expect(calls).toBe(1);
    onlineManager.setOnline(true);
    await expect(result).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('gives up after the attempts while online', async () => {
    onlineManager.setOnline(true);
    let calls = 0;
    await expect(
      sendWhenOnline(
        async () => {
          calls += 1;
          throw new Offline();
        },
        { isConnectionError, attempts: 3, delayMs: 0 },
      ),
    ).rejects.toBeInstanceOf(Offline);
    expect(calls).toBe(3);
  });

  it('passes other errors straight on', async () => {
    let calls = 0;
    await expect(
      sendWhenOnline(
        async () => {
          calls += 1;
          throw new Error('conflict');
        },
        { isConnectionError, delayMs: 0 },
      ),
    ).rejects.toThrow('conflict');
    expect(calls).toBe(1);
  });
});
