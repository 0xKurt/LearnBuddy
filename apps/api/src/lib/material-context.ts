// Loads the worksheet text a learner is actually working from, so the tutor
// and "Erklär mir das" can ground hints/explanations in the real material
// instead of a ≤200-char `source_excerpt`. Bounded so token cost stays sane
// (a scanned worksheet is normally a few pages and fits well under the cap).

import type { getDeps } from './deps.js';

const MAX_CONTEXT_CHARS = 4000;

type Supabase = ReturnType<typeof getDeps>['supabase'];

/** Returns the material's extracted markdown (clamped), or null. Never throws
 *  — missing context degrades the tutor gracefully, it must not break a turn. */
export async function loadMaterialContext(
  supabase: Supabase,
  materialId: string | null | undefined,
): Promise<string | null> {
  if (!materialId) return null;
  const res = await supabase
    .from('materials')
    .select('extracted_markdown')
    .eq('id', materialId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  const md = (res.data as { extracted_markdown: string | null }).extracted_markdown;
  if (!md) return null;
  const trimmed = md.trim();
  if (trimmed.length <= MAX_CONTEXT_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_CONTEXT_CHARS)}\n…[gekürzt]`;
}
