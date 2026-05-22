// In-memory Vertex context cache for the tutor agent's system header.
//
// Vertex AI bills cached input tokens at ~25 % of normal price. Our
// v3.1 tutor header is ~1700 tokens that's identical across every
// turn within a session. Caching it once per session and referencing
// the cache for subsequent turns drops effective input cost by ~45 %
// after the first turn.
//
// Why in-memory (not DB):
//   - Cache TTL is 1 h; sessions typically last 20-30 min. One cache
//     per Vercel function instance is fine.
//   - Cold start = we re-create the cache on the first turn (small
//     cost overhead, no functional difference).
//   - No migration, no schema change, no cross-instance coordination
//     needed.
//
// The Map is keyed by `${header_hash}::${model}` so all sessions
// using the same v3.1 header + same model share ONE cache. We don't
// per-session, per-subject, or per-locale shard — the header is
// identical regardless.

import { createHash } from 'node:crypto';
import type { GoogleGenAI } from '@google/genai';

const CACHE_TTL_SEC = 3600; // 1 h — Vertex max for most models
const CACHE_REFRESH_BEFORE_SEC = 300; // refresh ≤ 5 min before TTL expiry

type Entry = {
  name: string; // Vertex resource name (cachedContents/...)
  expiresAtMs: number; // local-clock expiry
  createdAtMs: number;
};

const CACHES = new Map<string, Entry>();

function keyFor(header: string, model: string): string {
  return `${createHash('sha256').update(header).digest('hex').slice(0, 16)}::${model}`;
}

/** Ensure a Vertex cached-content exists for the given system header
 *  + model. Returns the cache's resource name, or null on any failure
 *  (caller falls back to non-cached path). The Map entry is created
 *  optimistically and cleared on refresh failure. */
export async function ensureAgentCache(
  client: GoogleGenAI,
  header: string,
  model: string,
): Promise<string | null> {
  const key = keyFor(header, model);
  const existing = CACHES.get(key);
  const now = Date.now();
  if (existing && existing.expiresAtMs - now > CACHE_REFRESH_BEFORE_SEC * 1000) {
    return existing.name;
  }

  try {
    const cache = await client.caches.create({
      model,
      config: {
        systemInstruction: header,
        ttl: `${CACHE_TTL_SEC}s`,
        displayName: `lb-tutor-${key.slice(0, 8)}`,
      },
    });
    if (!cache.name) return null;
    CACHES.set(key, {
      name: cache.name,
      createdAtMs: now,
      expiresAtMs: now + CACHE_TTL_SEC * 1000,
    });
    return cache.name;
  } catch (err) {
    // Common failures: min-token threshold for the model, quota,
    // billing not enabled for caching, regional rollout. Each one
    // is non-fatal — we just stop using the cache and pay full price.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[agent-cache] create failed (${model}): ${msg}`);
    // If we had a stale entry, drop it so we don't keep handing out
    // an expired/invalid name.
    CACHES.delete(key);
    return null;
  }
}

/** Test-only: wipe all in-memory caches. Used by vitest tests that
 *  re-init the gateway and don't want a stale name from a prior run. */
export function __clearAgentCacheForTests(): void {
  CACHES.clear();
}
