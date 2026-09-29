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
export const DraftLinkSchema = Link;

const Draft = z.object({
  v: z.literal(1),
  requestId: z.string().nullable(),
  photos: z
    .array(
      z.object({
        uri: z.string().min(1),
        problems: z.array(z.enum(PROBLEMS)),
        kept: z.boolean(),
        /** A PDF (its file name); null for a photo. */
        pdf: z.string().nullable().default(null),
      }),
    )
    .min(1),
  link: Link,
  savedAt: z.string(),
});
export type CaptureDraft = z.output<typeof Draft>;
export type DraftPhoto = CaptureDraft['photos'][number];

const Sent = z.array(
  z.object({
    materialId: z.string(),
    uris: z.array(z.string()),
    sentAt: z.string(),
    /** One photo per page: false when a PDF was among them (its pages are not photos here). */
    paged: z.boolean().default(true),
  }),
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
  /** A stored URI brought to where the file is now (see `rebasedUri`); web: not needed. */
  resolve?(uri: string): string;
};

/**
 * A kept photo's URI, brought to where its directory is now. iOS gives the app a
 * new container path with every update; the files under Documents move with it,
 * but a URI kept in the draft still names the old path — the tiles then show no
 * picture (issue #57). A URI whose file sits directly in a directory named like
 * `dirUri`'s last segment is rebased onto `dirUri`; every other URI is returned
 * as it is.
 */
export function rebasedUri(uri: string, dirUri: string): string {
  const base = dirUri.endsWith('/') ? dirUri : `${dirUri}/`;
  if (uri.startsWith(base)) return uri;
  const name = base.slice(0, -1).split('/').at(-1);
  if (!name) return uri;
  const marker = `/${name}/`;
  const at = uri.lastIndexOf(marker);
  if (at < 0) return uri;
  const file = uri.slice(at + marker.length);
  if (file.length === 0 || file.includes('/')) return uri;
  return base + file;
}

/**
 * Android may kill the app while the camera is open (low memory); the photo
 * is then handed over on the next start (ImagePicker.getPendingResultAsync,
 * lib/capture/pendingCamera.ts). What the capture was for is noted before the
 * camera opens, so the recovered photo lands in the right capture (audit M-22).
 */
export const CameraOpen = z.object({ link: Link, at: z.string() });
export type CameraOpen = z.output<typeof CameraOpen>;

/** A camera hand-over older than this is not recovered (she has moved on). */
export const CAMERA_RECOVERY_MS = 30 * 60_000;

/** The noted capture, if it is recent enough to recover a photo into. */
export function cameraOpenOf(raw: string | null, now: Date): CameraOpen | null {
  const c = parse(CameraOpen, raw);
  if (!c) return null;
  const age = now.getTime() - Date.parse(c.at);
  return Number.isFinite(age) && age >= 0 && age <= CAMERA_RECOVERY_MS ? c : null;
}

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
  /** Every URI handed out or deleted goes through here: it may have moved (rebasedUri). */
  const fix = (uri: string): string => storage.resolve?.(uri) ?? uri;
  const drop = (uris: readonly string[]) => storage.drop(uris.map(fix));

  async function readSent(): Promise<SentPhotos> {
    return parse(Sent, await storage.read(SENT_KEY)) ?? [];
  }

  return {
    keep: (uri: string) => storage.keep(uri),
    drop,

    /** The draft left from before, if any and not too old (an old one is cleaned up). */
    async load(): Promise<CaptureDraft | null> {
      const draft = parse(Draft, await storage.read(DRAFT_KEY));
      if (!draft) return null;
      if (now().getTime() - Date.parse(draft.savedAt) > DRAFT_MAX_AGE_MS) {
        await this.discard(draft);
        return null;
      }
      return { ...draft, photos: draft.photos.map((p) => ({ ...p, uri: fix(p.uri) })) };
    },

    /** Not yet sent and not being sent right now: what home offers to go on with. */
    async leftBehind(): Promise<CaptureDraft | null> {
      const draft = await this.load();
      if (!draft || (draft.requestId && sending.has(draft.requestId))) return null;
      return draft;
    },

    async save(draft: Omit<z.input<typeof Draft>, 'v' | 'savedAt'>): Promise<void> {
      if (draft.photos.length === 0) return storage.write(DRAFT_KEY, null);
      const full: z.input<typeof Draft> = { ...draft, v: 1, savedAt: now().toISOString() };
      await storage.write(DRAFT_KEY, JSON.stringify(full));
    },

    /**
     * "Verwerfen": the draft and its photos are gone — never while they are
     * being sent (a requested send finishes; audit M-21). False when kept.
     */
    async discard(draft: CaptureDraft | null = null): Promise<boolean> {
      const d = draft ?? parse(Draft, await storage.read(DRAFT_KEY));
      if (d?.requestId && sending.has(d.requestId)) return false;
      await storage.write(DRAFT_KEY, null);
      if (d) await drop(d.photos.map((p) => p.uri));
      return true;
    },

    startSending(requestId: string) {
      sending.add(requestId);
    },
    stopSending(requestId: string) {
      sending.delete(requestId);
    },

    /**
     * Sent: the draft ends; the photos stay a day for the page notice. Only
     * this send's draft ends — a newer capture started meanwhile keeps its own.
     */
    async sent(
      materialId: string,
      uris: readonly string[],
      requestId: string,
      paged = true,
    ): Promise<void> {
      const current = parse(Draft, await storage.read(DRAFT_KEY));
      if (!current || current.requestId === requestId) await storage.write(DRAFT_KEY, null);
      const list = (await readSent()).filter((s) => s.materialId !== materialId);
      list.push({ materialId, uris: [...uris], sentAt: now().toISOString(), paged });
      await storage.write(SENT_KEY, JSON.stringify(list));
      await this.prune();
    },

    /** The photo of one page of a sent material (1-based), while it is kept. */
    async sentPage(materialId: string, page: number): Promise<string | null> {
      const entry = (await readSent()).find((s) => s.materialId === materialId);
      const uri = entry?.paged ? (entry.uris[page - 1] ?? null) : null;
      return uri === null ? null : fix(uri);
    },

    /** Signed out: the draft and every kept photo are deleted. */
    async clearAll(): Promise<void> {
      const d = parse(Draft, await storage.read(DRAFT_KEY));
      await storage.write(DRAFT_KEY, null);
      if (d) await drop(d.photos.map((p) => p.uri));
      const list = await readSent();
      await drop(list.flatMap((s) => s.uris));
      await storage.write(SENT_KEY, null);
    },

    /** Sent photos older than a day are deleted. */
    async prune(): Promise<void> {
      const list = await readSent();
      const cutoff = now().getTime() - SENT_KEEP_MS;
      const old = list.filter((s) => Date.parse(s.sentAt) < cutoff);
      if (old.length === 0) return;
      await drop(old.flatMap((s) => s.uris));
      await storage.write(SENT_KEY, JSON.stringify(list.filter((s) => !old.includes(s))));
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;
