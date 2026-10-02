// Browser walkthrough of the interactive figures (issues #248, #249): tapping a point, a place
// on a number line, a bar and a clock time; drawing a line, mirroring a triangle (without aiming,
// through "Eingeben") and pulling bars. Real app, real API, scripted model
// (apps/api/src/testing/scenarios/learning-modes.ts). Every stop is shot at 390×844 and 360×740
// and fails when anything would have to be scrolled (tests/web/fit.ts).
//
// Where to tap is read off the drawing itself — the numbers on its axes — so the test aims the
// way she does, and a frame that moved would make it miss rather than pass by accident.

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`figures-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

type Label = { text: string; x: number; y: number; anchor: string };

/** The numbers drawn on the figure, in page coordinates. */
async function labels(page: Page): Promise<{ box: DOMRectLike; labels: Label[] }> {
  return page.evaluate(() => {
    const layer = document.querySelector('[data-testid="figure-touch"]');
    const svg = layer?.parentElement?.querySelector('svg');
    if (!layer || !svg) throw new Error('no figure');
    const r = svg.getBoundingClientRect();
    const box = layer.getBoundingClientRect();
    const out = [...svg.querySelectorAll('text')].map((t) => ({
      text: (t.textContent ?? '').replace('−', '-'),
      x: r.left + Number(t.getAttribute('x')),
      y: r.top + Number(t.getAttribute('y')),
      anchor: t.getAttribute('text-anchor') ?? 'start',
    }));
    return {
      box: { left: box.left, top: box.top, width: box.width, height: box.height },
      labels: out,
    };
  });
}
type DOMRectLike = { left: number; top: number; width: number; height: number };

/** A straight map value → page position, fitted through the labels drawn for it. */
function fit(points: Array<{ v: number; at: number }>): (v: number) => number {
  expect(points.length, 'at least two numbers on the axis').toBeGreaterThanOrEqual(2);
  const [a, b] = [points[0]!, points[points.length - 1]!];
  const k = (b.at - a.at) / (b.v - a.v);
  return (v) => a.at + (v - a.v) * k;
}

/** Where the point (x | y) of the plane on screen is: read off its axis numbers. */
async function planeSpot(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const { labels: ls } = await labels(page);
  const num = (l: Label) => Number(l.text);
  const xs = ls.filter((l) => l.anchor === 'middle' && l.text !== '' && !Number.isNaN(num(l)));
  // y numbers stand right-aligned left of the axis, 4 px above their line's centre.
  const ys = ls.filter((l) => l.anchor === 'end' && l.text !== '0' && !Number.isNaN(num(l)));
  const px = fit(xs.map((l) => ({ v: num(l), at: l.x })));
  const py = fit(ys.map((l) => ({ v: num(l), at: l.y - 4 })));
  return { x: px(x), y: py(y) };
}

/** A tap on (x | y): the first one magnifies when the grid is fine, so tap until it is set. */
async function tapPoint(page: Page, x: number, y: number): Promise<void> {
  const at = await planeSpot(page, x, y);
  await page.mouse.click(at.x, at.y);
  if (await page.getByText('Vergrößert – tippe jetzt genau.').isVisible()) {
    const again = await planeSpot(page, x, y);
    await page.mouse.click(again.x, again.y);
  }
}

test('tapping in a figure: a point, a place on a line, a bar, a time (issue #248)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByLabel('Schreib Buddy …').fill('Ich will Koordinaten antippen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('tipp mal in ein paar Figuren', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Tippe den Punkt P(2 | −1) an.')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await expect(check).toBeDisabled();
  await shot(page, '50-tap-plane');

  // ── A point: 12 × 10 steps are too fine for a finger on 360 pt — the first tap magnifies. ──
  const first = await planeSpot(page, -1, 2);
  await page.mouse.click(first.x, first.y);
  await expect(page.getByText('Vergrößert – tippe jetzt genau.')).toBeVisible();
  await shot(page, '51-tap-plane-zoomed');
  const near = await planeSpot(page, -1, 2);
  await page.mouse.click(near.x, near.y);
  await expect(page.getByText('Dein Punkt: (−1 | 2)')).toBeVisible();
  await check.click();
  // Code saw what happened: x and y swapped.
  await expect(page.getByText('du hast x und y vertauscht', { exact: false })).toBeVisible();
  await shot(page, '52-tap-plane-swapped');
  await tapPoint(page, 2, -1);
  await expect(page.getByText('Dein Punkt: (2 | −1)')).toBeVisible();
  // A theme switch rebuilds the tree: the point stays (it is in the draft).
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Dein Punkt: (2 | −1)')).toBeVisible();
  await shot(page, '53-tap-plane-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── A place on a number line: quarters between −2 and 2. ──
  await expect(page.getByText('auf dem Zahlenstrahl?', { exact: false })).toBeVisible();
  const lineAt = async (v: number) => {
    const { labels: ls } = await labels(page);
    const ticks = ls.filter((l) => !Number.isNaN(Number(l.text)) && l.text !== '');
    return fit(ticks.map((l) => ({ v: Number(l.text), at: l.x })))(v);
  };
  const lineY = async () => (await labels(page)).box.top + 52;
  await page.mouse.click(await lineAt(0.75), await lineY());
  if (await page.getByText('Vergrößert – tippe jetzt genau.').isVisible()) {
    await shot(page, '54-tap-line-zoomed');
    await page.mouse.click(await lineAt(0.75), await lineY());
  }
  await expect(page.getByText('Deine Zahl: 0,75')).toBeVisible();
  await shot(page, '55-tap-line');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── A bar: the whole column is the target. ──
  await expect(page.getByText('am meisten geregnet', { exact: false })).toBeVisible();
  const bars = (await labels(page)).box;
  await page.mouse.click(bars.left + bars.width * (2.5 / 4), bars.top + bars.height * 0.5);
  await expect(page.getByText('Deine Säule: Juli')).toBeVisible();
  await shot(page, '56-tap-bars');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── A clock: the short hand first, then the long one. ──
  await expect(page.getByText('Stell die Uhr auf Viertel nach drei.')).toBeVisible();
  await shot(page, '57-tap-clock');
  const face = (await labels(page)).box;
  const cx = face.left + face.width / 2;
  const cy = face.top + face.height / 2;
  const r = face.width * 0.3;
  // Three o'clock is to the right of the centre — for the hour and for a quarter past.
  await page.mouse.click(cx + r, cy);
  await expect(page.getByRole('radio', { name: 'Großer Zeiger' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.mouse.click(cx + r, cy);
  await expect(page.getByText('Deine Uhrzeit: 3:15 Uhr')).toBeVisible();
  await shot(page, '58-tap-clock-set');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '58b-tap-clock-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

test('drawing on a grid: a line, a mirror image without aiming, bars (issue #249)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByLabel('Schreib Buddy …').fill('Lass uns auf dem Raster zeichnen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('ein paar Zeichnungen auf dem Raster', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Zeichne die Gerade', { exact: false })).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await shot(page, '60-draw-line');

  // ── y = 2x − 1, first with the right slope through the wrong place. ──
  await tapPoint(page, 0, 0);
  await expect(page.getByText('Punkte: (0 | 0)')).toBeVisible();
  await tapPoint(page, 1, 2);
  await expect(page.getByText('Punkte: (0 | 0), (1 | 2)')).toBeVisible();
  await shot(page, '61-draw-line-two');
  await check.click();
  await expect(page.getByText('Die Steigung stimmt schon', { exact: false })).toBeVisible();
  await shot(page, '62-draw-line-feedback');
  // "Rückgängig" twice, then two points that are right — any two.
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.getByText('Setze zwei Punkte', { exact: false })).toBeVisible();
  await tapPoint(page, 0, -1);
  await tapPoint(page, 2, 3);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Punkte: (0 | −1), (2 | 3)')).toBeVisible();
  await shot(page, '63-draw-line-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Mirror a triangle — through "Eingeben", the way without aiming. ──
  await expect(page.getByText('Spiegle das Dreieck', { exact: false })).toBeVisible();
  await shot(page, '64-draw-mirror');
  await page.getByRole('button', { name: 'Eingeben' }).click();
  const sheet = page.locator('[aria-modal="true"]');
  const step = async (name: string, times: number) => {
    for (let i = 0; i < times; i++) await sheet.getByRole('button', { name }).click();
  };
  // From (0 | 0): to (9 | 1), set; to (6 | 1), set; to (7 | 4), set.
  await step('x größer', 9);
  await step('y größer', 1);
  await sheet.getByRole('button', { name: 'Punkt setzen' }).click();
  await step('x kleiner', 3);
  await sheet.getByRole('button', { name: 'Punkt setzen' }).click();
  await step('x größer', 1);
  await step('y größer', 3);
  await sheet.getByRole('button', { name: 'Punkt setzen' }).click();
  await expect(sheet.getByText('Punkte: (9 | 1), (6 | 1), (7 | 4)')).toBeVisible();
  await shot(page, '65-draw-mirror-sheet');
  await sheet.getByRole('button', { name: 'Fertig' }).last().click();
  await expect(sheet).toHaveCount(0);
  await shot(page, '66-draw-mirror-set');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Bars: pulled up to their height. ──
  await expect(page.getByText('Zeichne das Säulendiagramm', { exact: false })).toBeVisible();
  await expect(check).toBeDisabled();
  const pull = async (bar: string, value: number) => {
    const { labels: ls } = await labels(page);
    const ys = ls.filter((l) => l.anchor === 'end' && !Number.isNaN(Number(l.text)));
    const py = fit(ys.map((l) => ({ v: Number(l.text), at: l.y - 4 })));
    const x = ls.find((l) => l.text === bar)!.x;
    await page.mouse.move(x, py(0) - 2);
    await page.mouse.down();
    await page.mouse.move(x, py(value / 2), { steps: 4 });
    await page.mouse.move(x, py(value), { steps: 4 });
    await page.mouse.up();
  };
  await pull('Mo', 4);
  await pull('Di', 6);
  await pull('Mi', 2);
  await expect(page.getByText('Mo 4 · Di 6 · Mi 2')).toBeVisible();
  await shot(page, '67-draw-bars');
  await check.click();
  await expect(page.getByText('Die Säule „Di“ hat noch nicht die richtige Höhe.')).toBeVisible();
  await shot(page, '68-draw-bars-feedback');
  await pull('Di', 7);
  await expect(page.getByText('Mo 4 · Di 7 · Mi 2')).toBeVisible();
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
