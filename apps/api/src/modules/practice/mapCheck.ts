// A question on a stumme Karte (issue #251), checked before it is stored. Rule 0: the model only
// NAMES regions; code resolves every name against the Natural Earth data (@learnbuddy/shared-math
// `maps.ts`), and a name the map has no region for costs the question — the shapes, the names in
// five languages and the key's spelling are the data's, never the model's.
//
// Two questions can be asked on a map, both with a place as the key — a region, or since #429 a
// capital, a river or a mountain range of the map's layer (`l`):
//   · "Tippe auf Bayern", "Tippe auf den Rhein" — answered by tapping (`ItemDraft.tap`); the tap
//     check (`tapCheck.ts`, the one mechanism of every tappable figure) holds the key to a place
//     of the map that the map does not mark;
//   · "Wie heißt das markierte Bundesland?", "… der markierte Fluss?" — typed (kind short): exactly
//     one place marked, and the key is that place. Anything else about a map — a neighbour, which
//     river flows through which city — is no fact of this data, and a question about it is
//     dropped rather than trusted.
// Every place the question needs — the one to tap, the marked ones — must be big enough for a
// finger on a 360 phone. On Europe code zooms in where it is not (`mapZoom`: Luxembourg on
// Mitteleuropa); where no Ausschnitt carries it, the question is dropped. Rejected, never
// repaired. What is stored names each marked place by its id, on the view code chose.
//
// On the Gradnetz (#429) a place is a crossing of its lines, written "50° N, 10° O": "Welche
// Koordinaten hat der markierte Punkt?" or "Tippe auf 50° N, 10° O". The model writes it in the
// question's language, where "20° O" is west in French; code reads it so (`gridWritten`) and
// stores it as `mapGrid.ts` writes it — a point where no two lines cross is no place, as a name
// no region has.
//
// Her own Land (#429, owner's decision of 08.10.): code reads it from her profile
// (`curriculum_region`, `mapHomeLand`), never from the model. Where she has one, a map the model
// wrote without a view is the map of Germany (`mapViewed`); without one such a map costs the
// question, as a map without a view always did. And on a map of Germany her Land is outlined
// (`withHome`; never filled, so never read as the marked place) — but only where it says nothing
// about the key: never on a layer of places (it would say in which Land a capital, a river or a
// range lies), and never where her Land is itself the place marked or the place to tap.

import {
  FIGURE_NAMES,
  gridParse,
  gridText,
  isGridMap,
  isMap,
  mapCanonical,
  mapMarked,
  mapPlace,
  mapLayer,
  mapProblem,
  mapRegion,
  mapZoom,
  regionName,
  type MapView,
} from '@learnbuddy/shared-math';
import type { DrawnFigure, ModelFigure } from '@learnbuddy/shared-types/contracts';

type Mapped = { kind: string; answer: string; figure: DrawnFigure | null; tap?: boolean | null };
/**
 * A map the model wrote without a view (#429): read as one on Germany, and marked so until code
 * reads her profile (`mapViewed`). Never stored.
 */
type UnviewedMap = Extract<DrawnFigure, { type: 'map' }> & { unviewed: true };

/**
 * A figure as a question is parsed with it (`ItemDraft.figure`): a map without a view on Germany,
 * marked as unviewed. Every other figure as the model wrote it.
 */
export function viewOf(f: ModelFigure): DrawnFigure | UnviewedMap;
export function viewOf(f: ModelFigure | null): DrawnFigure | UnviewedMap | null;
export function viewOf(f: ModelFigure | null): DrawnFigure | UnviewedMap | null {
  if (f === null || f.type !== 'map') return f;
  return f.v === undefined ? { ...f, v: 'de', unviewed: true } : { ...f, v: f.v };
}

function unviewed(f: DrawnFigure | null): f is UnviewedMap {
  return f !== null && 'unviewed' in f;
}

/**
 * The question with a view on every map it shows (#429): a map the model left without one stays
 * on Germany where she has a Land (`land`, `mapHomeLand`); without her Land it cannot be drawn,
 * and the question goes (null). The first thing that reads a map.
 */
export function mapViewed<
  T extends { figure: DrawnFigure | null; choice_figures?: readonly DrawnFigure[] | null },
>(it: T, land: string | null): T | null {
  const options = it.choice_figures ?? [];
  if (!unviewed(it.figure) && !options.some(unviewed)) return it;
  if (land === null) return null;
  const seen = <F extends DrawnFigure | null>(f: F): F | DrawnFigure =>
    unviewed(f) ? { type: 'map', v: f.v, hl: f.hl, l: f.l } : f;
  return {
    ...it,
    figure: seen(it.figure),
    ...(it.choice_figures ? { choice_figures: it.choice_figures.map(seen) } : {}),
  };
}

/**
 * The line that tells the model it may leave a map's view out (#429), or null where she has no
 * Land — then nothing changes for it. Code still decides: `mapViewed` reads her Land itself.
 */
export function homeLandLine(land: string | null): string | null {
  const i = land === null ? null : mapRegion(FIGURE_NAMES, 'de', land);
  if (i === null) return null;
  return `HOME LAND: ${regionName(FIGURE_NAMES.maps.de, i, 'de')}. A map question that needs no particular map leaves the map's v out: code then shows the map of Germany with her Land. Write v = europe or world where the topic is about them.`;
}

/**
 * The question with her Land outlined on its map of Germany (#429) where that says nothing about the
 * key: the regions or the Gradnetz, her Land neither the marked place nor the place to tap. Read
 * after `checkedMap`, on the view code chose and the places written as ids.
 */
export function withHome<T extends Mapped>(it: T, land: string | null): T {
  const f = it.figure;
  if (land === null || !f || !isMap(f) || f.v !== 'de') return it;
  const layer = mapLayer(f);
  if (layer !== 'regions' && layer !== 'grid') return it;
  if (layer === 'regions') {
    const home = mapRegion(FIGURE_NAMES, 'de', land);
    const key = it.tap === true ? mapPlace(FIGURE_NAMES, f, it.answer) : null;
    if (home === null || key === home || mapMarked(FIGURE_NAMES, f).includes(home)) return it;
  }
  return { ...it, figure: { ...f, home: land } };
}

/**
 * The view this question about a map is asked on (code may zoom in, `mapZoom`), or why it cannot
 * be asked. A question without a map is no business of this check.
 */
function mapItemView(it: Mapped): { view: MapView } | { problem: string } | null {
  const f = it.figure;
  if (!f || !isMap(f)) return null;
  const problem = mapProblem(FIGURE_NAMES, f);
  if (problem) return { problem };
  if (it.tap === true) {
    // On a place of the map, unmarked: the tap check (`tapCheck.ts`). Here only what it cannot
    // know without the shapes: a place too small for a finger on a phone is never the key.
    const key = mapPlace(FIGURE_NAMES, f, it.answer);
    const view = key === null ? null : mapZoom(FIGURE_NAMES, f, key);
    return view ? { view } : { problem: `"${it.answer}" is too small to tap on the map ${f.v}` };
  }
  if (it.kind !== 'short') return { problem: `a ${it.kind} question about a map` };
  const marked = mapMarked(FIGURE_NAMES, f);
  if (marked.length !== 1) return { problem: 'name the marked place: mark exactly one' };
  const key = mapPlace(FIGURE_NAMES, f, it.answer);
  if (key === null) return { problem: `no place "${it.answer}" on the map ${f.v}` };
  if (key !== marked[0]) return { problem: 'the key is not the marked place' };
  const view = mapZoom(FIGURE_NAMES, f, null);
  return view ? { view } : { problem: `the marked place is too small on the map ${f.v}` };
}

/**
 * A question on the Gradnetz with its crossings as code writes them: each marked one in German
 * (what is stored), the key in `lang` (what she is shown) — both read back alike. A text that is
 * no coordinate stays as the model wrote it, and costs the question in `mapItemView`.
 */
function gridWritten<T extends Mapped>(it: T, lang: string): T {
  const f = it.figure;
  if (!f || !isMap(f) || !isGridMap(f)) return it;
  const read = (text: string) => gridParse(text, lang);
  const hl = f.hl.map((n) => {
    const p = read(n);
    return p ? gridText(p, 'de') : n;
  });
  const key = read(it.answer);
  return { ...it, answer: key ? gridText(key, lang) : it.answer, figure: { ...f, hl } };
}

/**
 * The question on the view code chose, its places written as ids, or null when it cannot be
 * asked. `locale`: the language the questions are written in — her language, German for a sheet.
 */
export function checkedMap<T extends Mapped>(raw: T | null, locale: string | null): T | null {
  if (!raw) return null;
  const it = gridWritten(raw, locale ?? 'de');
  const checked = mapItemView(it);
  if (checked === null) return it;
  if ('problem' in checked) return null;
  const f = it.figure;
  return f && isMap(f)
    ? { ...it, figure: mapCanonical(FIGURE_NAMES, { ...f, v: checked.view }) }
    : it;
}
