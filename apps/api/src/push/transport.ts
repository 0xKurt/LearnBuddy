// Push delivery through Expo's push service. docs/architecture.md §Delivery.
//
// Evidence levels (Expo documentation, sending-notifications.mdx):
//   ticket ok   = Expo accepted the message — NOT delivered;
//   receipt ok  = handed to APNs/FCM — still not proof it reached the device;
//   receipts appear within ~15 min and are deleted after 24 h.
// Only the app can prove a notification was opened.
//
// Uncertainty: when a send request may have reached Expo but we got no
// answer (timeout, 5xx, dropped connection), the outcome is unknown and the
// caller must NOT resend automatically.

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  /** Replaces an earlier notification for the same topic on the device. */
  collapseId?: string;
};

export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; error: string; message: string };

export type PushReceipt = { status: 'ok' } | { status: 'error'; error: string };

/** The provider may or may not have accepted the request. */
export class PushUncertainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushUncertainError';
  }
}

/** The provider definitely did not accept the request (safe to retry later). */
export class PushRejectedError extends Error {
  readonly retryAfterSeconds: number | null;
  constructor(message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = 'PushRejectedError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface PushTransport {
  readonly enabled: boolean;
  /** One ticket per message, same order. */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  /** Receipts for ticket ids; missing ids have no receipt yet. */
  receipts(ticketIds: string[]): Promise<Map<string, PushReceipt>>;
}

export class DisabledPush implements PushTransport {
  readonly enabled = false;
  async send(): Promise<PushTicket[]> {
    throw new PushRejectedError('push is disabled', null);
  }
  async receipts(): Promise<Map<string, PushReceipt>> {
    return new Map();
  }
}

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

type FetchLike = typeof fetch;

export class ExpoPush implements PushTransport {
  readonly enabled = true;

  constructor(
    private readonly accessToken: string | undefined,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
    };
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];
    if (messages.length > 100) throw new Error('Expo accepts at most 100 messages per request');
    let res: Response;
    try {
      res = await this.fetchImpl(SEND_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(
          messages.map((m) => ({
            to: m.to,
            title: m.title,
            body: m.body,
            data: m.data,
            sound: 'default',
            priority: 'default',
            ...(m.collapseId ? { collapseId: m.collapseId } : {}),
          })),
        ),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const code = (err as { cause?: { code?: string } } | null)?.cause?.code;
      // Connection never established → the request cannot have been processed.
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        throw new PushRejectedError(`push service unreachable (${code})`, 60);
      }
      throw new PushUncertainError('no answer from the push service');
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      throw new PushRejectedError('push service rate limit', Number.isFinite(retry) ? retry : 60);
    }
    if (res.status >= 500) throw new PushUncertainError(`push service error ${res.status}`);
    if (!res.ok) throw new PushRejectedError(`push request rejected (${res.status})`, null);
    const body = (await res.json().catch(() => null)) as {
      data?: Array<{
        status?: string;
        id?: string;
        message?: string;
        details?: { error?: string };
      }>;
    } | null;
    const data = body?.data;
    if (!Array.isArray(data) || data.length !== messages.length) {
      throw new PushUncertainError('unexpected answer from the push service');
    }
    return data.map(
      (t): PushTicket =>
        t.status === 'ok' && typeof t.id === 'string'
          ? { status: 'ok', id: t.id }
          : { status: 'error', error: t.details?.error ?? 'Unknown', message: t.message ?? '' },
    );
  }

  async receipts(ticketIds: string[]): Promise<Map<string, PushReceipt>> {
    const out = new Map<string, PushReceipt>();
    for (let i = 0; i < ticketIds.length; i += 1000) {
      const ids = ticketIds.slice(i, i + 1000);
      const res = await this.fetchImpl(RECEIPTS_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ ids }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`receipt request failed (${res.status})`);
      const body = (await res.json()) as {
        data?: Record<string, { status?: string; details?: { error?: string } }>;
      };
      for (const [id, r] of Object.entries(body.data ?? {})) {
        out.set(
          id,
          r.status === 'ok'
            ? { status: 'ok' }
            : { status: 'error', error: r.details?.error ?? 'Unknown' },
        );
      }
    }
    return out;
  }
}
