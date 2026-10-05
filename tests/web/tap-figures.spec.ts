// Browser walkthrough of tapping inside a figure (issue #248): a place on a number line, a point
// of a coordinate system (dragged there), a column of a bar chart and a clock face set hand by
// hand. On the line and the coordinate system the words under the figure only say THAT she chose;
// the value is the screen reader's (`aria-valuetext`, issue #409). A second walk taps a stumme
// Karte (issue #251): every one of the 16 Länder, a continent, and names a marked country —
// scripted in apps/api/src/testing/scenarios/map.ts, shot at 93–95. Scripted answers in apps/api/src/testing/scenarios/tap.ts; every verdict below is code's —
// no tutor is scripted for any. Every question is shot at both phone sizes, light and dark, with
// the keyboard up for her question (test-results/web/shots, 96-…).
//
// The taps are aimed with the app's own geometry (`tapLayout`): where a place stands is the
// drawers' arithmetic, and a tap here lands where a finger aimed at that mark would.

import { expect, test, type Page } from '@playwright/test';

import { clockGeometry } from '../../apps/mobile/lib/math/figureGeometry';
import { tapLayout } from '../../apps/mobile/lib/math/tapLayout';
import { MAP_SHAPES } from '../../packages/shared-math/src/mapShapes.data';
import { mapRegion, mapRegions, type MapView } from '../../packages/shared-math/src/maps';
import { REGION_FRAME } from '../../packages/shared-math/src/regions';
import type { Tappable } from '../../packages/shared-math/src/tap';
import { onboardChild, startOffer, typed } from './figureWalk';
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
  const mark = tapLayout(figure, box.width, String, 12)?.markOf(pick);
  if (!mark) throw new Error('no mark');
  return mark.kind === 'dot'
    ? { x: mark.x, y: mark.y, box }
    : { x: mark.box.x + mark.box.w / 2, y: mark.box.y + mark.box.h / 2, box };
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

/** Where the label of region `name` stands on the pad of a map, in the pad's own coordinates. */
async function labelOn(page: Page, view: MapView, name: string) {
  const box = await page.getByTestId('tap-pad').boundingBox();
  if (!box) throw new Error('no tap pad');
  const at = MAP_SHAPES[view].regions[mapRegion(view, name) ?? -1]?.at;
  if (!at) throw new Error(`no region ${name}`);
  const k = box.width / REGION_FRAME;
  return { x: at[0] * k, y: at[1] * k };
}

async function tapRegion(page: Page, view: MapView, name: string): Promise<void> {
  await page.getByTestId('tap-pad').click({ position: await labelOn(page, view, name) });
}

test('a stumme Karte: every Land tapped, a marked country named, a continent tapped (#251)', async ({
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
  for (const land of mapRegions('de')) {
    await tapRegion(page, 'de', land.de);
    await expect(spoken(page)).toHaveAttribute('aria-valuetext', `Gebiet: ${land.de}`);
  }
  await expect(words(page)).toHaveText('Gebiet gewählt');
  await tapRegion(page, 'de', 'Bayern');
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

  // The world: a continent.
  await expect(page.getByText('Tippe auf Südamerika.')).toBeVisible();
  await tapRegion(page, 'world', 'Südamerika');
  await expect(spoken(page)).toHaveAttribute('aria-valuetext', 'Gebiet: Südamerika');
  await bothRooms(page, '95-map-world');
  await checkRight(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
