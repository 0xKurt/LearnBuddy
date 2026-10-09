// Photo storage (Supabase Storage, private bucket "material-photos"). The app
// uploads directly with short-lived signed URLs; the API only signs, reads
// for extraction and deletes. Tests use testing/fakes.ts MemoryStorage.

import type { Config } from '../config.js';
import { failureOfStatus, type Outcome } from '../lib/outcome.js';
import { serviceClient } from '../lib/supabase.js';

const PHOTO_BUCKET = 'material-photos';

export type UploadTarget = { path: string; url: string; token: string };

/**
 * The provider could not answer (outage, timeout, rate limit). Never means "the photo is
 * not there": callers retry instead of blaming the learner (docs/architecture.md §Material).
 */
export class StorageError extends Error {
  /** The shared classification (lib/outcome.ts, audit S-7); never "absent". */
  readonly outcome: Exclude<Outcome, 'ok'>;
  constructor(
    op: 'sign' | 'list' | 'download' | 'upload' | 'remove',
    outcome: Exclude<Outcome, 'ok'>,
  ) {
    super(`storage ${op} failed (${outcome})`);
    this.name = 'StorageError';
    this.outcome = outcome;
  }
}

/**
 * A Supabase Storage error → outcome. The HTTP status is on `status` (StorageApiError) or on
 * the original response (StorageUnknownError); none means no answer (`unknown`).
 */
export function storageOutcomeOf(error: unknown): Exclude<Outcome, 'ok'> {
  const e = (error ?? {}) as { status?: unknown; originalError?: unknown };
  const original = e.originalError as { status?: unknown } | undefined;
  return failureOfStatus(
    typeof e.status === 'number'
      ? e.status
      : typeof original?.status === 'number'
        ? original.status
        : null,
  );
}

/** Supabase Storage deletes at most 1000 objects per request. */
export const STORAGE_REMOVE_LIMIT = 1000;

export interface StorageGateway {
  createUploadTarget(path: string): Promise<UploadTarget>;
  /** Which of `paths` exist. Throws StorageError when the provider cannot tell. */
  existing(paths: string[]): Promise<Set<string>>;
  /** The object, or null when it is absent. Throws StorageError when the provider fails. */
  download(path: string): Promise<Uint8Array | null>;
  /**
   * The API writes an object itself (server-made concept-image crops, issue #50; the app's
   * photos go up with signed URLs instead). Throws StorageError when the provider fails.
   */
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /**
   * A short-lived signed URL to read one object (a concept image in a session view).
   * Throws StorageError when the provider fails.
   */
  createDownloadUrl(path: string, ttlSeconds: number): Promise<string>;
  /**
   * Deletes at most STORAGE_REMOVE_LIMIT paths; a path that is already gone counts as
   * deleted. Throws StorageError when the provider fails.
   */
  remove(paths: string[]): Promise<void>;
}

/** Deletes any number of paths, in provider-sized chunks. */
export async function removeAll(storage: StorageGateway, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_LIMIT) {
    await storage.remove(paths.slice(i, i + STORAGE_REMOVE_LIMIT));
  }
}

export class SupabaseStorage implements StorageGateway {
  private readonly client;

  constructor(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>) {
    this.client = serviceClient(config);
  }

  async createUploadTarget(path: string): Promise<UploadTarget> {
    // upsert: a retry after a partial upload signs the same paths again, and a photo that
    // already arrived may be sent once more. The path is the learner's own and server-made.
    const { data, error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new StorageError('sign', storageOutcomeOf(error));
    return { path, url: data.signedUrl, token: data.token };
  }

  async existing(paths: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const byFolder = new Map<string, string[]>();
    for (const p of paths) {
      const i = p.lastIndexOf('/');
      const folder = p.slice(0, i);
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), p.slice(i + 1)]);
    }
    for (const [folder, names] of byFolder) {
      const { data, error } = await this.client.storage
        .from(PHOTO_BUCKET)
        .list(folder, { limit: 100 });
      if (error || !data) throw new StorageError('list', storageOutcomeOf(error));
      const present = new Set((data ?? []).map((o) => o.name));
      for (const n of names) if (present.has(n)) found.add(`${folder}/${n}`);
    }
    return found;
  }

  async download(path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(PHOTO_BUCKET).download(path);
    if (error) {
      if (isNotFound(error)) return null;
      throw new StorageError('download', storageOutcomeOf(error));
    }
    if (!data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    // upsert: a repeated attach after a crash overwrites its own object, never a learner's
    // photo (crop names never collide with the app's numbered photo paths).
    const { error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) throw new StorageError('upload', storageOutcomeOf(error));
  }

  async createDownloadUrl(path: string, ttlSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (error || !data) throw new StorageError('sign', storageOutcomeOf(error));
    return data.signedUrl;
  }

  async remove(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_LIMIT) {
      // Deleting an absent object is not an error for Supabase Storage (it is left out of
      // the returned list), so a repeated purge is harmless.
      const { error } = await this.client.storage
        .from(PHOTO_BUCKET)
        .remove(paths.slice(i, i + STORAGE_REMOVE_LIMIT));
      if (error) throw new StorageError('remove', storageOutcomeOf(error));
    }
  }
}

/**
 * Supabase Storage answers a missing object with HTTP 400 and `statusCode: "404"` (or a
 * plain 404). Anything else — network, 5xx, 429 — is a failure, not an absence.
 * requires live verification in Claude Code session (against the hosted Storage API)
 */
function isNotFound(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; originalError?: unknown };
  if (e.status === 404 || e.statusCode === '404' || e.statusCode === 404) return true;
  const original = e.originalError as { status?: unknown } | undefined;
  return original?.status === 404;
}
