// Photos that are not sent yet survive the app being closed (docs/architecture.md
// §Material; the old app lost them). While Lena takes photos, the capture screen
// keeps a draft: the photos (copied where the system does not clean up), what
// the check found, and what they are for. If the app is closed, killed or
// updated before the photos are sent, Buddy's home offers to go on with them.
// A draft that was already being sent keeps its request id, so going on uses
// the same material (the API answers repeats with it) and nothing is doubled.
//
// Photos that were sent are kept on the phone for a day, so a notice about a
// page that could not be read can show that very page.
//
// Pure: the storage is passed in (draftStorage.ts on a phone, .web.ts in a browser).

import { z } from 'zod';

const PROBLEMS = ['blurry', 'dark', 'washed_out', 'small', 'tilted'] as const;

const Link = z.object({
  stepId: z.string().nullable(),
  goalId: z.string().nullable(),
  purpose: z.enum(['study', 'homework']),
  completes: z.string().nullable(),
  /** "2, 3": the pages photographed again (for the title). */
  pages: z.string().nullable(),
  /** A page added to the sheet (not one Buddy could not read). */
  add: z.boolean().default(false),
});
export type DraftLink = z.output<typeof Link>;

const Draft = z.object({
  v: z.literal(1),
  requestId: z.string().nullable(),
  photos: z
    .array(
      z.object({
        uri: z.string().min(1),
        problems: z.array(z.enum(PROBLEMS)),
        kept: z.boolean(),
      }),
    )
    .min(1),
  link: Link,
  savedAt: z.string(),
});
export type CaptureDraft = z.infer<typeof Draft>;

const Sent = z.array(
  z.object({ materialId: z.string(), uris: z.array(z.string()), sentAt: z.string() }),
);
export type SentPhotos = z.infer<typeof Sent>;

/** A draft older than this is dropped (the photos are deleted after 7 days on the server too). */
export const DRAFT_MAX_AGE_MS = 7 * 86_400_000;
/** Sent photos are kept this long on the phone for the page notice (it shows for 24 h). */
export const SENT_KEEP_MS = 24 * 3_600_000;

export type DraftStorage = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string | null): Promise<void>;
  /** A copy of the photo where it survives (native: documents; web: a data URL). */
  keep(uri: string): Promise<string>;
  /** Deletes kept copies; missing ones are fine. */
  drop(uris: readonly string[]): Promise<void>;
};

const DRAFT_KEY = 'lb.capture.draft.v1';
const SENT_KEY = 'lb.capture.sent.v1';

function parse<S extends z.ZodTypeAny>(schema: S, raw: string | null): z.output<S> | null {
  if (!raw) return null;
  try {
    const r = schema.safeParse(JSON.parse(raw));
    return r.success ? (r.data as z.output<S>) : null;
  } catch {
    return null;
  }
}

export function createDraftStore(storage: DraftStorage, now: () => Date = () => new Date()) {
  /** Sends in progress in this app run (then the draft is not "left behind"). */
  const sending = new Set<string>();

  async function readSent(): Promise<SentPhotos> {
    return parse(Sent, await storage.read(SENT_KEY)) ?? [];
  }

  return {
    keep: (uri: string) => storage.keep(uri),
    drop: (uris: readonly string[]) => storage.drop(uris),

    /** The draft left from before, if any and not too old (an old one is cleaned up). */
    async load(): Promise<CaptureDraft | null> {
      const draft = parse(Draft, await storage.read(DRAFT_KEY));
      if (!draft) return null;
      if (now().getTime() - Date.parse(draft.savedAt) > DRAFT_MAX_AGE_MS) {
        await this.discard(draft);
        return null;
      }
      return draft;
    },

    /** Not yet sent and not being sent right now: what home offers to go on with. */
    async leftBehind(): Promise<CaptureDraft | null> {
      const draft = await this.load();
      if (!draft || (draft.requestId && sending.has(draft.requestId))) return null;
      return draft;
    },

    async save(draft: Omit<CaptureDraft, 'v' | 'savedAt'>): Promise<void> {
      if (draft.photos.length === 0) return storage.write(DRAFT_KEY, null);
      const full: CaptureDraft = { ...draft, v: 1, savedAt: now().toISOString() };
      await storage.write(DRAFT_KEY, JSON.stringify(full));
    },

    /** "Verwerfen": the draft and its photos are gone. */
    async discard(draft: CaptureDraft | null = null): Promise<void> {
      const d = draft ?? parse(Draft, await storage.read(DRAFT_KEY));
      await storage.write(DRAFT_KEY, null);
      if (d) await storage.drop(d.photos.map((p) => p.uri));
    },

    startSending(requestId: string) {
      sending.add(requestId);
    },
    stopSending(requestId: string) {
      sending.delete(requestId);
    },

    /** Sent: the draft ends; the photos stay a day for the page notice. */
    async sent(materialId: string, uris: readonly string[]): Promise<void> {
      await storage.write(DRAFT_KEY, null);
      const list = (await readSent()).filter((s) => s.materialId !== materialId);
      list.push({ materialId, uris: [...uris], sentAt: now().toISOString() });
      await storage.write(SENT_KEY, JSON.stringify(list));
      await this.prune();
    },

    /** The photo of one page of a sent material (1-based), while it is kept. */
    async sentPage(materialId: string, page: number): Promise<string | null> {
      const entry = (await readSent()).find((s) => s.materialId === materialId);
      return entry?.uris[page - 1] ?? null;
    },

    /** Signed out: the draft and every kept photo are deleted. */
    async clearAll(): Promise<void> {
      await this.discard();
      const list = await readSent();
      await storage.drop(list.flatMap((s) => s.uris));
      await storage.write(SENT_KEY, null);
    },

    /** Sent photos older than a day are deleted. */
    async prune(): Promise<void> {
      const list = await readSent();
      const cutoff = now().getTime() - SENT_KEEP_MS;
      const old = list.filter((s) => Date.parse(s.sentAt) < cutoff);
      if (old.length === 0) return;
      await storage.drop(old.flatMap((s) => s.uris));
      await storage.write(SENT_KEY, JSON.stringify(list.filter((s) => !old.includes(s))));
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
