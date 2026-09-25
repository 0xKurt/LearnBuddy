// Photo storage (Supabase Storage, private bucket "material-photos"). The app
// uploads directly with short-lived signed URLs; the API only signs, reads
// for extraction and deletes. Tests use testing/fakes.ts MemoryStorage.

import { createClient } from '@supabase/supabase-js';

import type { Config } from '../config.js';

export const PHOTO_BUCKET = 'material-photos';

export type UploadTarget = { path: string; url: string; token: string };

export interface StorageGateway {
  createUploadTarget(path: string): Promise<UploadTarget>;
  /** Which of `paths` exist. */
  existing(paths: string[]): Promise<Set<string>>;
  download(path: string): Promise<Uint8Array | null>;
  remove(paths: string[]): Promise<void>;
}

export class SupabaseStorage implements StorageGateway {
  private readonly client;

  constructor(config: Config) {
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createUploadTarget(path: string): Promise<UploadTarget> {
    // upsert: a retry after a partial upload signs the same paths again, and a photo that
    // already arrived may be sent once more. The path is the learner's own and server-made.
    const { data, error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error('could not create upload URL');
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
      const { data } = await this.client.storage.from(PHOTO_BUCKET).list(folder, { limit: 100 });
      const present = new Set((data ?? []).map((o) => o.name));
      for (const n of names) if (present.has(n)) found.add(`${folder}/${n}`);
    }
    return found;
  }

  async download(path: string): Promise<Uint8Array | null> {
    const { data, error } = await this.client.storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) throw new Error('could not remove photos');
  }
}
