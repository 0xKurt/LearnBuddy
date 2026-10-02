// Names on a map, both directions (issue #251, Regel 0):
//   - what the MODEL wrote ("Bayern", "Bavaria", "Italien") is resolved against the names in
//     the data; a name that fits no feature, or two, gives no question;
//   - what SHE typed is compared with the names of the marked feature — every language the
//     data has, and its long and formal names. Nothing here is a list of answers written for
//     a test: every name comes from Natural Earth (or, for the zones, from `features.ts`).

import {
  allMapFeatures,
  mapFeatures,
  type MapAreaId,
  type MapFeature,
  type MapLayer,
} from './features.js';

/**
 * A name as it is compared: without accents, case, ß, punctuation and the spacing around a
 * hyphen ("Baden-Württemberg" = "baden wurttemberg").
 */
export function nameKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The keys a written name may have: as is, and with umlauts written out (ü → ue). */
function keysOf(name: string): string[] {
  const a = nameKey(name);
  const spelled = nameKey(
    name
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue'),
  );
  return a === spelled ? [a] : [a, spelled];
}

export function namesOf(f: Pick<MapFeature, 'names' | 'alt'>): string[] {
  return [...Object.values(f.names), ...f.alt].filter((n): n is string => !!n);
}

function featureKeys(f: Pick<MapFeature, 'names' | 'alt'>): Set<string> {
  return new Set(namesOf(f).flatMap(keysOf));
}

/** Does this text name this feature? */
export function namesFeature(f: Pick<MapFeature, 'names' | 'alt'>, text: string): boolean {
  const k = nameKey(text);
  return k !== '' && featureKeys(f).has(k);
}

/**
 * The one feature of a layer that a name means, or why there is none: `none` when no feature
 * has the name, `ambiguous` when two have it.
 */
export function resolveMapName(
  area: MapAreaId,
  layer: MapLayer,
  text: string,
): MapFeature | 'none' | 'ambiguous' {
  const hits = mapFeatures(area, layer).filter((f) => namesFeature(f, text));
  if (hits.length === 0) return 'none';
  if (hits.length > 1) return 'ambiguous';
  return hits[0]!;
}

/** Optimal-string-alignment distance (the one `practice/evaluate.ts` uses for typed words). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

/** Slips allowed for a name of this length — the rule typed words follow (none up to 4 letters). */
function allowedSlips(key: string): number {
  const letters = key.replace(/\s+/g, '').length;
  return letters <= 4 ? 0 : letters <= 8 ? 1 : 2;
}

/**
 * What a typed name says about the marked feature:
 *   right  — one of its names;
 *   slip   — a small slip of one of its names that is no other feature's name (she knows it);
 *   other  — the name of another feature on this map (its id, so the reply can say more);
 *   wrong  — none of these.
 * Another feature's name is checked BEFORE a slip: "Island" for "Irland" is a country, not a
 * typo.
 */
export type NameVerdict =
  | { verdict: 'right' }
  | { verdict: 'slip' }
  | { verdict: 'other'; id: string }
  | { verdict: 'wrong' };

export function judgeMapName(area: MapAreaId, key: MapFeature, text: string): NameVerdict {
  const k = nameKey(text);
  if (k === '') return { verdict: 'wrong' };
  const own = featureKeys(key);
  if (own.has(k)) return { verdict: 'right' };
  const other = allMapFeatures(area).find((f) => f.id !== key.id && featureKeys(f).has(k));
  if (other) return { verdict: 'other', id: other.id };
  for (const name of own)
    if (editDistance(k, name) <= allowedSlips(name)) return { verdict: 'slip' };
  return { verdict: 'wrong' };
}
