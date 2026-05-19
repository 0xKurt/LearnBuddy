// Loads the worksheet text a learner is actually working from, so the tutor
// and "Erklär mir das" can ground hints/explanations in the real material
// instead of a ≤200-char `source_excerpt`. Bounded so token cost stays sane
// (a scanned worksheet is normally a few pages and fits well under the cap).
//
// Process-local LRU cache: `extracted_markdown` is set once at extraction and
// never mutated, so caching by material_id is safe. A sustained "keep going"
// session previously read the same row from Postgres on every turn (30-turn
// session = 30 redundant round-trips). The cache survives within a warm
// serverless container; cold starts re-fetch on first use, which is fine.

import type { getDeps } from './deps.js';

const MAX_CONTEXT_CHARS = 4000;
const CACHE_MAX = 50;

type Supabase = ReturnType<typeof getDeps>['supabase'];

const cache = new Map<string, string | null>();

function recordHit(key: string, value: string | null): string | null {
  // LRU eviction: keep the cache bounded. On hit, re-insert to mark recent.
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}

/** Returns the material's extracted markdown (clamped), or null. Never throws
 *  — missing context degrades the tutor gracefully, it must not break a turn. */
export async function loadMaterialContext(
  supabase: Supabase,
  materialId: string | null | undefined,
): Promise<string | null> {
  if (!materialId) return null;
  if (cache.has(materialId)) return recordHit(materialId, cache.get(materialId)!);
  const res = await supabase
    .from('materials')
    .select('extracted_markdown')
    .eq('id', materialId)
    .maybeSingle();
  if (res.error || !res.data) return recordHit(materialId, null);
  const md = (res.data as { extracted_markdown: string | null }).extracted_markdown;
  if (!md) return recordHit(materialId, null);
  const trimmed = md.trim();
  const clamped =
    trimmed.length <= MAX_CONTEXT_CHARS
      ? trimmed
      : `${trimmed.slice(0, MAX_CONTEXT_CHARS)}\n…[gekürzt]`;
  return recordHit(materialId, clamped);
}

/** Test helper: clear the cache between cases so one test's material doesn't
 *  poison another's. Not exposed to route code. */
export function __clearMaterialContextCache(): void {
  cache.clear();
}
