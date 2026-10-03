// How the parts of a structured task are laid out and named (issues #228–#230): a shuffle that
// is the same for the same content (no clock, no randomness — a test, a replay and a second
// reading of a sheet see the same card), ids by display position, and the one notion of two
// elements being the same. docs/architecture.md §Practice ("Structured items").

import type { PartId } from '@learnbuddy/shared-types/contracts';
import { plainMath } from '@learnbuddy/shared-math';

/** An element as it is compared for sameness: markup, case and surrounding marks set aside. */
export function sameness(text: string): string {
  return plainMath(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?"'„“”‚‘’«»]+|[\s.,;:!?"'„“”‚‘’«»]+$/g, '')
    .trim();
}

/** A small deterministic generator, so the same elements always shuffle the same way. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over the text: a stable seed per content. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A deterministic shuffle of `n` positions (per content), the first of `tries` that `fits` —
 * or null when none of them does.
 */
export function shuffleWhere(
  n: number,
  seedText: string,
  fits: (idx: readonly number[]) => boolean,
  tries = 64,
): number[] | null {
  const base = hash(seedText);
  for (let attempt = 0; attempt < tries; attempt++) {
    const random = seeded(base + attempt);
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    if (fits(idx)) return idx;
  }
  return null;
}

/**
 * Display positions for `n` elements: a shuffle that is neither the right order nor its
 * reverse (both would give the task away). Deterministic per content, so a test, a replay
 * and a second reading of the same sheet see the same card.
 */
export function displayOrder(n: number, seedText: string): number[] {
  const unsolved = (idx: readonly number[]) =>
    !idx.every((v, i) => v === i) && !idx.every((v, i) => v === n - 1 - i);
  // The fallback is unreachable for n ≥ 3 (a rotation is neither); kept so the result is
  // always defined.
  return (
    shuffleWhere(n, seedText, unsolved, 32) ?? Array.from({ length: n }, (_, i) => (i + 1) % n)
  );
}

/** Ids by display position: a, b, c … — they say where an element STANDS, not where it belongs. */
export function idAt(position: number): PartId {
  return String.fromCharCode(97 + position);
}

/** Ids of the right side by position: r1, r2 … (the left side is a, b, c … like an order). */
export function rightIdAt(position: number): PartId {
  return `r${position + 1}`;
}
