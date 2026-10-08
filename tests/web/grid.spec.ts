// Browser walkthrough of drawing on a grid (issue #249), against the real API with the scripted
// model (apps/api/src/testing/scenarios/grid.ts). She taps crossings to plot points, sets two
// points of y = 2x − 1 (the app draws the line), mirrors a quadrilateral on squared paper and pulls
// six bars; a tap on her point takes it away, the arrows move it, "Zurück" undoes. Every case is
// the LARGEST its mode may be (contracts/grid.ts), and every `shot` measures at 390×844 and 360×740
// that nothing has to be scrolled (tests/web/fit.ts), also with Buddy's reply above the paper and
// with the keyboard up for her question.

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { bothSchemes, PHONES } from './fit';

/** Where the paper's grid lines stand on the page: x for each unit across, y for each one down. */
async function gridLines(page: Page): Promise<{ xs: number[]; ys: number[] }> {
  const paper = page.getByTestId('grid-paper');
  await expect(paper.locator('svg')).toBeVisible();
  return paper.evaluate((el) => {
    const svg = el.querySelector('svg')!;
    const box = svg.getBoundingClientRect();
    const lines = [...svg.querySelectorAll('line')].map((l) => {
      const n = (a: string) => Number(l.getAttribute(a));
      return { x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2') };
    });
    // A grid line runs over the whole paper, top to bottom or left to right; the axes overshoot
    // into their arrows and run the other way, the ticks are short: the commonest length wins.
    const pick = (ls: typeof lines, len: (l: (typeof lines)[number]) => number) => {
      const counts = new Map<number, number>();
      for (const l of ls) counts.set(Math.round(len(l)), (counts.get(Math.round(len(l))) ?? 0) + 1);
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return ls.filter((l) => Math.round(len(l)) === common);
    };
    const across = pick(
      lines.filter((l) => l.x1 === l.x2 && l.y1 < l.y2),
      (l) => l.y2 - l.y1,
    );
    const down = pick(
      lines.filter((l) => l.y1 === l.y2 && l.x1 < l.x2),
      (l) => l.x2 - l.x1,
    );
    const uniq = (v: number[]) =>
      [...new Set(v.map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
    return {
      xs: uniq(across.map((l) => l.x1)).map((x) => box.left + x),
      ys: uniq(down.map((l) => l.y1)).map((y) => box.top + y),
    };
  });
}

/** Taps the crossing (x | y) of a paper whose lower left corner is (x0 | y0). */
async function tapCrossing(
  page: Page,
  x0: number,
  y0: number,
  x: number,
  y: number,
): Promise<void> {
  const { xs, ys } = await gridLines(page);
  const px = xs[x - x0];
  const py = ys[ys.length - 1 - (y - y0)];
  if (px === undefined || py === undefined) throw new Error(`(${x} | ${y}) is off the paper`);
  // A finger is never exactly on the crossing: a few points off still takes it.
  await page.mouse.click(px + 4, py - 3);
}

/** Pulls bar `i` (0-based) to `rows` rows. */
async function pullBar(page: Page, i: number, rows: number): Promise<void> {
  const { xs, ys } = await gridLines(page);
  await page.mouse.click((xs[i]! + xs[i + 1]!) / 2, ys[ys.length - 1 - rows]! + 2);
}

const words = (page: Page) => page.getByTestId('grid-words');
/** A key of the paper's one key row (never a header's "Zurück"). */
const key = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Zeichnen' }).getByRole('button', { name, exact: true });
const check = (page: Page) => page.getByRole('button', { name: 'Prüfen' });

async function right(page: Page): Promise<void> {
  await check(page).click();
  await expect(page.getByText('Stimmt', { exact: false }).last()).toBeVisible();
}

async function finish(page: Page): Promise<void> {
  // A finished set moves on to its summary by itself (`finishWhenDone`); while a state is shot at
  // every size that may already have happened, so "Weiter" is pressed only where it still stands.
  const next = page.getByRole('button', { name: 'Weiter' }).filter({ visible: true });
  const done = page.getByText('Geschafft!').filter({ visible: true });
  await expect(next.or(done).first()).toBeVisible();
  if (await next.isVisible()) await next.click();
  await expect(done).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
}

test('drawing on a grid: points, a line, a mirror image, bars — checked by code (issue #249)', async ({
  page,
}) => {
  // Eleven states, each at two sizes, light and dark, and with the keyboard up.
  test.setTimeout(600_000);
  await onboardChild(page, 'grid');
  await page.setViewportSize(PHONES[0]);

  // ── four points on a paper of 8 × 6 units ──
  await startOffer(page, 'Ich will Punkte eintragen', 'trag die Punkte');
  await expect(page.getByText('Trage die Punkte ins Koordinatensystem ein:')).toBeVisible();
  await expect(check(page)).toBeDisabled();
  await bothSchemes(page, '249a-grid-points-start');
  await tapCrossing(page, -4, -3, 3, 2);
  await tapCrossing(page, -4, -3, -2, 1);
  await tapCrossing(page, -4, -3, -3, -2);
  // D with the wrong sign of x — a classic mistake.
  await tapCrossing(page, -4, -3, -1, -2);
  await expect(words(page)).toHaveText('A(3|2) · B(−2|1) · C(−3|−2) · D(−1|−2)');
  await bothSchemes(page, '249b-grid-points-drawn');
  await check(page).click();
  await expect(page.getByText('Noch nicht ganz: D liegt noch nicht richtig.')).toBeInViewport();
  await bothSchemes(page, '249c-grid-points-feedback');
  // A tap on D takes it away; the next tap puts D back.
  await tapCrossing(page, -4, -3, -1, -2);
  await expect(words(page)).toHaveText('A(3|2) · B(−2|1) · C(−3|−2) · als Nächstes D');
  await tapCrossing(page, -4, -3, 1, -2);
  await right(page);
  await finish(page);

  // ── y = 2x − 1 with any two right points (the acceptance of #249) ──
  await startOffer(page, 'Lass uns eine Gerade zeichnen', 'setz zwei Punkte');
  await expect(page.getByText('Setze 2 Punkte, die auf dem Graphen liegen.')).toBeVisible();
  await tapCrossing(page, -4, -3, 0, -1);
  await bothSchemes(page, '249d-grid-line-one');
  await tapCrossing(page, -4, -3, 1, 2);
  await check(page).click();
  await expect(
    page.getByText('Noch nicht ganz: (1|2) liegt nicht auf dem Graphen.'),
  ).toBeInViewport();
  await bothSchemes(page, '249e-grid-line-feedback');
  // The arrow moves the point she set last, one crossing.
  await key(page, 'Nach unten').click();
  await expect(words(page)).toHaveText('(0|−1) · (1|1)');
  await right(page);
  await bothSchemes(page, '249f-grid-line-right');
  await finish(page);

  // ── a quadrilateral mirrored on squared paper ──
  await startOffer(page, 'Ich möchte eine Figur spiegeln', 'spiegle das Viereck');
  await bothSchemes(page, '249g-grid-mirror-start');
  await tapCrossing(page, 0, 0, 7, 1);
  await tapCrossing(page, 0, 0, 5, 1);
  await tapCrossing(page, 0, 0, 5, 3);
  await tapCrossing(page, 0, 0, 6, 5);
  await check(page).click();
  await expect(page.getByText('Noch nicht ganz: D′ liegt noch nicht richtig.')).toBeInViewport();
  await bothSchemes(page, '249h-grid-mirror-feedback');
  await key(page, 'Zurück').click();
  await expect(words(page)).toHaveText('A′(7|1) · B′(5|1) · C′(5|3) · als Nächstes D′');
  await tapCrossing(page, 0, 0, 6, 4);
  await right(page);
  await bothSchemes(page, '249i-grid-mirror-right');
  await finish(page);

  // ── six bars on six rows ──
  await startOffer(page, 'Können wir Säulen zeichnen?', 'zieh die Säulen');
  await expect(
    page.getByText('Apfel 4, Birne 3, Kiwi 5, Banane 2, Mango 1, Traube 3'),
  ).toBeVisible();
  await bothSchemes(page, '249j-grid-bars-start');
  for (const [i, rows] of [4, 3, 5, 2, 1, 2].entries()) await pullBar(page, i, rows);
  // A bar chart says it on the paper itself: its values stand in the question and on the scale.
  await expect(
    page.getByRole('button', {
      name: 'Säulendiagramm: Apfel 4 · Birne 3 · Kiwi 5 · Banane 2 · Mango 1 · Traube 2',
    }),
  ).toBeVisible();
  await check(page).click();
  await expect(
    page.getByText('Noch nicht ganz: Die Säule für Traube stimmt noch nicht.'),
  ).toBeInViewport();
  await bothSchemes(page, '249k-grid-bars-feedback');
  await key(page, 'Höher').click();
  await right(page);
  await finish(page);
});
