// Browser walkthrough of tapping inside a figure (issue #248): a place on a number line, a point
// of a coordinate system (dragged there), a column of a bar chart and a clock face set hand by
// hand. On the line and the coordinate system the words under the figure only say THAT she chose;
// the value is the screen reader's (`aria-valuetext`, issue #409). A second walk taps a stumme
// Karte (issue #251): every one of the 16 Länder, a continent, and names a marked country; since
// #429 Luxembourg on the closer Ausschnitt code picks, every river of Germany, a marked river to
// name, a capital and a marked range to name, and on the Gradnetz the crossings along 50° N and
// 10° O of Germany, one of Europe and the coordinates of a marked one of the world (a walk of its
// own) — scripted in apps/api/src/testing/scenarios/map.ts, shot at 93–95. A third labels a
// picture and taps its parts (issue #252, scenarios/schematic.ts, shot at 90–92b); a fourth walks
// the drawings of #252's second part, each numbered and tapped (shot at 89-library-…). Scripted
// answers in apps/api/src/testing/scenarios/tap.ts; every verdict below is code's —
// no tutor is scripted for any. Every question is shot at both phone sizes, light and dark, with
// the keyboard up for her question (test-results/web/shots, 96-…).
//
// The taps are aimed with the app's own geometry (`tapLayout`): where a place stands is the
// drawers' arithmetic, and a tap here lands where a finger aimed at that mark would.

import { expect, test, type Page } from '@playwright/test';

import { clockGeometry } from '../../apps/mobile/lib/math/figureGeometry';
import { tapLayout } from '../../apps/mobile/lib/math/tapLayout';
import { FIGURE_NAMES } from '../../packages/shared-math/src/figureNames.data';
import { mapGrid } from '../../packages/shared-math/src/mapGrid';
import { MAP_SHAPES } from '../../packages/shared-math/src/mapShapes.data';
import {
  mapPlace,
  mapPlaces,
  mapRegions,
  type MapLayer,
  type MapView,
} from '../../packages/shared-math/src/maps';
import { REGION_FRAME } from '../../packages/shared-math/src/regions';
import { SCHEMATIC_SHAPES } from '../../packages/shared-math/src/schematicShapes.data';
import {
  schematic,
  schematicPart,
  type SchematicId,
} from '../../packages/shared-math/src/schematics';
import type { Tappable } from '../../packages/shared-math/src/tap';
import { LIBRARY_ITEMS } from '../../apps/api/src/testing/scenarios/schematic';
import { bothRooms as cardRooms, onboardChild, startOffer, typed } from './figureWalk';
import { shot } from './fit';

const LINE: Tappable = { type: 'number_line', min: 0, max: 5, step: 0.5, points: [] };
const PLANE: Tappable = {
  type: 'function_plot',
  x_min: -4,
  x_max: 4,
  y_min: -4,
  y_max: 4,
  points: [{ x: -3, y: 2, label: 'A' }],
};
const BARS: Tappable = {
  type: 'bar_chart',
  bars: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai'].map((label, i) => ({ label, value: i })),
};

/** Where the mark of `pick` stands on the pad, in the pad's own coordinates. */
async function markOn(page: Page, figure: Tappable, pick: number[]) {
  const box = await page.getByTestId('tap-pad').boundingBox();
  if (!box) throw new Error('no tap pad');
  const mark = tapLayout(FIGURE_NAMES, figure, box.width, String, 12, { maps: MAP_SHAPES })?.markOf(
    pick,
  );
  if (!mark) throw new Error('no mark');
  return mark.kind === 'box'
    ? { x: mark.box.x + mark.box.w / 2, y: mark.box.y + mark.box.h / 2, box }
    : { x: mark.x, y: mark.y, box };
}

async function tapPlace(page: Page, figure: Tappable, pick: number[]): Promise<void> {
  const { x, y } = await markOn(page, figure, pick);
  await page.getByTestId('tap-pad').click({ position: { x, y } });
}

/** A tap on the clock face at the mark of `hour` (1–12), a third of the face from its centre. */
async function tapDial(page: Page, hour: number): Promise<void> {
  const box = await page.getByTestId('tap-pad').boundingBox();
  if (!box) throw new Error('no tap pad');
  const { d } = clockGeometry(1, box.width);
  const rad = ((hour * 30 - 90) * Math.PI) / 180;
  await page.getByTestId('tap-pad').click({
    position: { x: box.width / 2 + (d / 3) * Math.cos(rad), y: d / 2 + (d / 3) * Math.sin(rad) },
  });
}

/** Light and dark, both phones, the keyboard up for her question. */
async function bothRooms(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('tap-figure')).toBeVisible();
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** "Prüfen", code says right, on to the next question. */
async function checkRight(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

const words = (page: Page) => page.getByTestId('tap-words');
/** The value of her place as a screen reader hears it — never as visible text (issue #409). */
const spoken = (page: Page) => page.getByRole('slider', { name: 'Deine Stelle in der Abbildung' });

test('tapping inside a figure: a place, a point, a column, a clock — graded by code', async ({
  page,
}) => {
  await onboardChild(page, 'tap');
  await startOffer(page, 'Lass uns Zahlenstrahl und Uhr antippen', 'direkt in die Bilder');

  // The number line: in the answer, at the bottom — not in the card above.
  await expect(
    page.getByText('Wo liegt 2,5 auf dem Zahlenstrahl?', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('question-figure')).toHaveCount(0);
  await expect(words(page)).toHaveText('Tippe auf die Stelle am Zahlenstrahl.');
  // Nothing tapped, nothing to check.
  await expect(page.getByRole('button', { name: 'Prüfen' })).toBeDisabled();
  await shot(page, '96-tap-line-empty');
  await tapPlace(page, LINE, [5]);
  // Only that she chose: the value in plain sight would let her tap until it matches (#409).
  await expect(words(page)).toHaveText('Stelle gewählt');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Stelle: 2,5');
  await bothRooms(page, '96-tap-line');
  await checkRight(page);

  // The coordinate system: dragged from the wrong place to the right one — the mark follows.
  await expect(page.getByText('Markiere den Punkt (2 | −1)', { exact: false })).toBeVisible();
  const from = await markOn(page, PLANE, [3, 6]);
  const to = await markOn(page, PLANE, [6, 3]);
  await page.mouse.move(from.box.x + from.x, from.box.y + from.y);
  await page.mouse.down();
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Punkt (−1 | 2)');
  await page.mouse.move(to.box.x + to.x, to.box.y + to.y, { steps: 8 });
  await page.mouse.up();
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Punkt (2 | −1)');
  await expect(words(page)).toHaveText('Punkt gesetzt');
  await bothRooms(page, '97-tap-point');
  await checkRight(page);

  // The bar chart: the column she means is framed.
  await expect(page.getByText('am meisten geregnet', { exact: false })).toBeVisible();
  await tapPlace(page, BARS, [3]);
  await expect(words(page)).toHaveText('Säule: Apr');
  await bothRooms(page, '98-tap-bar');
  await checkRight(page);

  // The clock: the small hand to the 7, then — without a step in between — the large one to the 9.
  await expect(page.getByText('Stell die Uhr auf Viertel vor acht.')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Kleiner Zeiger' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot(page, '99-tap-clock-empty');
  await tapDial(page, 7);
  await expect(words(page)).toContainText('der kleine Zeiger auf der 7');
  await expect(page.getByRole('radio', { name: 'Großer Zeiger' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await tapDial(page, 9);
  // Where the hands stand, never the time they make: reading that is the task.
  await expect(words(page)).toHaveText(
    'Uhr: der kleine Zeiger zwischen 7 und 8, der große Zeiger auf der 9',
  );
  await bothRooms(page, '99-tap-clock');
  await checkRight(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

/** A tap on the place `name` of a map's layer, at its mark (a region's or a river's label). */
async function tapOnMap(page: Page, v: MapView, name: string, l: MapLayer = 'regions') {
  const figure = { type: 'map', v, hl: [], l } as const;
  const i = mapPlace(FIGURE_NAMES, figure, name);
  if (i === null) throw new Error(`no place ${name}`);
  await tapPlace(page, figure, [i]);
}

/** A tap on the crossing at `lat`, `lon` of view `v`'s Gradnetz, at its dot. */
async function tapCrossing(page: Page, v: MapView, lat: number, lon: number) {
  const grid = mapGrid(v);
  if (!grid) throw new Error(`no grid on ${v}`);
  await tapPlace(page, { type: 'map', v, hl: [], l: 'grid' }, [
    grid.lon.indexOf(lon),
    grid.lat.indexOf(lat),
  ]);
}

test('a stumme Karte: every Land, Luxembourg, every river, a capital tapped (#251, #429)', async ({
  page,
}) => {
  await onboardChild(page, 'map');
  await startOffer(page, 'Lass uns Karten üben', 'auf der Karte');

  // Germany: the map in the answer; every one of the 16 Länder can be tapped, the city states
  // smaller than a finger at their label, and the line under the map never names it (#409).
  await expect(page.getByText('Tippe auf Bayern.')).toBeVisible();
  await expect(words(page)).toHaveText('Tippe auf das Gebiet in der Karte.');
  await expect(page.getByRole('button', { name: 'Prüfen' })).toBeDisabled();
  await shot(page, '93-map-de-empty');
  for (const land of mapRegions(FIGURE_NAMES, 'de')) {
    await tapOnMap(page, 'de', land.de);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Gebiet: ${land.de}`);
  }
  await expect(words(page)).toHaveText('Gebiet gewählt');
  await tapOnMap(page, 'de', 'Bayern');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Gebiet: Bayern');
  await bothRooms(page, '93-map-de');
  await checkRight(page);

  // Europe: the marked country stands in the card; she names it.
  await expect(page.getByText('Wie heißt das markierte Land?')).toBeVisible();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await shot(page, '94-map-europe');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '94-map-europe-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await typed(page, 'Frankreich');

  // Luxembourg: too small on the whole of Europe, so code picked the closer Ausschnitt (#429).
  await expect(page.getByText('Tippe auf Luxemburg.')).toBeVisible();
  await tapOnMap(page, 'eu_central', 'Luxemburg');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Gebiet: Luxemburg');
  await bothRooms(page, '94-map-luxembourg');
  await checkRight(page);

  // The rivers of Germany: every one is tapped on its own line (#429).
  await expect(page.getByText('Tippe auf den Rhein.')).toBeVisible();
  await expect(words(page)).toHaveText('Tippe auf den Fluss in der Karte.');
  const rivers = { type: 'map', v: 'de', hl: [], l: 'rivers' } as const;
  for (const river of mapPlaces(FIGURE_NAMES, rivers)) {
    await tapOnMap(page, 'de', river.de, 'rivers');
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Fluss: ${river.de}`);
  }
  await expect(words(page)).toHaveText('Fluss gewählt');
  await tapOnMap(page, 'de', 'Rhein', 'rivers');
  await bothRooms(page, '94-map-rivers');
  await checkRight(page);

  // A marked river in the card: she names it.
  await expect(page.getByText('Wie heißt der markierte Fluss?')).toBeVisible();
  await shot(page, '94-map-river-marked');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '94-map-river-marked-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await typed(page, 'Elbe');

  // A capital: the dots of the 16 Landeshauptstädte.
  await expect(page.getByText('Tippe auf München.')).toBeVisible();
  await tapOnMap(page, 'de', 'Hannover', 'cities');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Stadt: Hannover');
  await tapOnMap(page, 'de', 'München', 'cities');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Stadt: München');
  await bothRooms(page, '94-map-cities');
  await checkRight(page);

  // A marked mountain range in the card: she names it.
  await expect(page.getByText('Wie heißt das markierte Gebirge?')).toBeVisible();
  await shot(page, '94-map-range-marked');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '94-map-range-marked-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await typed(page, 'Harz');

  // The world: a continent.
  await expect(page.getByText('Tippe auf Südamerika.')).toBeVisible();
  await tapOnMap(page, 'world', 'Südamerika');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Gebiet: Südamerika');
  await bothRooms(page, '95-map-world');
  await checkRight(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

test('the Gradnetz: crossings tapped on Germany and Europe, coordinates typed (#429)', async ({
  page,
}) => {
  await onboardChild(page, 'grid');
  await startOffer(page, 'Lass uns das Gradnetz üben', 'Punkte im Gradnetz');

  // Germany, every degree: a crossing tapped like a point of a coordinate system. Every
  // crossing along 50° N and along 10° O at its dot; the line under the map only says that she
  // chose, the coordinates are the screen reader's.
  await expect(page.getByText('Tippe auf den Punkt 50° N, 10° O.')).toBeVisible();
  await expect(words(page)).toHaveText('Tippe auf den Punkt im Gradnetz.');
  const de = mapGrid('de')!;
  for (const lon of de.lon) {
    await tapCrossing(page, 'de', 50, lon);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Punkt: 50° N, ${lon}° O`);
  }
  for (const lat of de.lat) {
    await tapCrossing(page, 'de', lat, 10);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Punkt: ${lat}° N, 10° O`);
  }
  await expect(words(page)).toHaveText('Punkt gewählt');
  await tapCrossing(page, 'de', 50, 10);
  await bothRooms(page, '95-map-grid-de');
  await checkRight(page);

  // Europe: every ten degrees, the lines curved as its projection draws them.
  await expect(page.getByText('Tippe auf den Punkt 60° N, 10° O.')).toBeVisible();
  await tapCrossing(page, 'europe', 50, -10);
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Punkt: 50° N, 10° W');
  await tapCrossing(page, 'europe', 60, 10);
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Punkt: 60° N, 10° O');
  await bothRooms(page, '95-map-grid-europe');
  await checkRight(page);

  // The world: the coordinates of the marked crossing, typed in her notation.
  await expect(page.getByText('Welche Koordinaten hat der markierte Punkt?')).toBeVisible();
  await shot(page, '95-map-grid-world');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '95-map-grid-world-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await typed(page, '30°S 60°W');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

/** Tap the part `name` of drawing `d` at its own point, in the pad's coordinates. */
async function tapPart(page: Page, d: SchematicId, id: string): Promise<void> {
  const box = await page.getByTestId('tap-pad').boundingBox();
  if (!box) throw new Error('no tap pad');
  const part = SCHEMATIC_SHAPES[d].parts.find((p) => p.id === id);
  if (!part) throw new Error(`no part ${id}`);
  const k = box.width / REGION_FRAME;
  await page.getByTestId('tap-pad').click({ position: { x: part.at[0] * k, y: part.at[1] * k } });
}

test('a labelled picture: the cell labelled number by number, every part tapped (#252)', async ({
  page,
}) => {
  await onboardChild(page, 'picture');
  await startOffer(page, 'Lass uns Bilder beschriften', 'beschriftest du');

  // The labelling task as code wrote it: one question per number, the numbers on the drawing.
  await expect(page.getByText('Pflanzenzelle: Wie heißt Teil 1?')).toBeVisible();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await shot(page, '90-picture-label');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '90-picture-label-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await typed(page, 'Zellkern');
  await expect(page.getByText('Pflanzenzelle: Wie heißt Teil 2?')).toBeVisible();
  // Any of a part's names counts: the English one too.
  await typed(page, 'vacuole');
  await expect(page.getByText('Pflanzenzelle: Wie heißt Teil 3?')).toBeVisible();
  await typed(page, 'Chloroplast');

  // Every part of the cell is reached at its own point; the line names none of them.
  await expect(page.getByText('Tippe auf den Zellkern.')).toBeVisible();
  await expect(words(page)).toHaveText('Tippe auf das Teil in der Abbildung.');
  for (const part of schematic(FIGURE_NAMES, 'plant_cell').parts) {
    await tapPart(page, 'plant_cell', part.id);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Teil: ${part.de}`);
  }
  await expect(words(page)).toHaveText('Teil gewählt');
  await tapPart(page, 'plant_cell', 'nucleus');
  await bothRooms(page, '91-picture-cell');
  await checkRight(page);

  // The bicycle's frame: many strokes, one part.
  await expect(page.getByText('Tippe auf den Rahmen.')).toBeVisible();
  await tapPart(page, 'bicycle', 'frame');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Teil: Rahmen');
  await bothRooms(page, '92-picture-bike');
  await checkRight(page);

  // A drawing of #252's second part: every traffic sign reached at its own point.
  await expect(page.getByText('Tippe auf das Schild für den Radweg.')).toBeVisible();
  for (const part of schematic(FIGURE_NAMES, 'signs').parts) {
    await tapPart(page, 'signs', part.id);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Teil: ${part.de}`);
  }
  await tapPart(page, 'signs', 'cycle_path');
  await bothRooms(page, '92b-picture-signs');
  await checkRight(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

test('the drawings of #252’s second part: each numbered beside it, every part tapped', async ({
  page,
}) => {
  // Ten drawings, each shot numbered and tapped at both phone sizes in both rooms.
  test.setTimeout(600_000);
  await onboardChild(page, 'library');
  await startOffer(page, 'Lass uns die Bildbibliothek ansehen', 'Bilder der Bibliothek');
  for (const item of LIBRARY_ITEMS) {
    await expect(page.getByText(item.prompt)).toBeVisible();
    const d: SchematicId = item.figure.d;
    if ('tap' in item) {
      // Every part is reached at its own point; the key last.
      for (const part of schematic(FIGURE_NAMES, d).parts) {
        await tapPart(page, d, part.id);
        await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Teil: ${part.de}`);
      }
      await tapPart(
        page,
        d,
        schematic(FIGURE_NAMES, d).parts[schematicPart(FIGURE_NAMES, d, item.answer)!]!.id,
      );
      await bothRooms(page, `89-library-${d}-tap`);
      await checkRight(page);
    } else {
      // Six numbers beside the drawing, each joined to its part; she names the first.
      await cardRooms(page, `89-library-${d}`);
      await typed(page, item.answer);
    }
  }
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
