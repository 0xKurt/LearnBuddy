// Browser walkthrough of the Fehlerdetektiv and of written arithmetic (issue #260), against the real
// API with the scripted model (apps/api/src/testing/scenarios/written.ts). She taps the wrong line
// of a worked solution and writes it right in the bar; she writes a calculation in columns digit by
// digit, carries included. Code judges both, and Buddy's reply names the place — the line above,
// the column — never the solution. Every `shot` measures at 390×844 and 360×740 that nothing has
// to be scrolled (tests/web/fit.ts), with the keyboard up too; the largest cases (four long lines, the
// five-row grids, a division of three steps shown step by step — #413) are shot with Buddy's reply
// above them.

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { PHONES, settle, shot, SHOTS } from './fit';

/** One state at both phone sizes (`shot`), light and then dark. */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/**
 * Writes digits into the cells of the grid by id ('' empties a cell). The last digit of a division
 * step moves her on, and the step shrinks to the digits she wrote (#413): the cell is read then.
 */
async function write(page: Page, cells: Record<string, string>): Promise<void> {
  for (const [id, digit] of Object.entries(cells)) {
    const cell = page.getByTestId(`column-${id}`);
    const shown = () =>
      cell.evaluate((e) => (e instanceof HTMLInputElement ? e.value : (e.textContent ?? '')));
    await expect(async () => {
      if (await cell.evaluate((e) => e instanceof HTMLInputElement)) await cell.fill(digit);
      await expect.poll(shown, { timeout: 1000 }).toBe(digit);
    }).toPass();
  }
}

/** The grid with the number pad up: the cell she writes in stays in view above it. */
async function cellWithKeyboard(page: Page, id: string, name: string): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 360, height: 740 - 300 });
  const cell = page.getByTestId(`column-${id}`);
  await cell.focus();
  await settle(page);
  await expect(cell, `${name}: the cell above the keyboard`).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await cell.blur();
  if (size) await page.setViewportSize(size);
}

async function checkRight(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
}

/** The bar's field, filled until the value holds (a theme switch remounts the tree). */
async function writeLine(page: Page, text: string): Promise<void> {
  const field = page.getByTestId('answer-field');
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1000 });
  }).toPass();
}

const ADD = {
  r3c5: '0',
  r2c4: '1',
  r3c4: '1',
  r2c3: '1',
  r3c3: '1',
  r2c2: '1',
  r3c2: '6',
};

const MUL = {
  r1c4: '5',
  r1c3: '4',
  r1c2: '9',
  r1c1: '3',
  r2c5: '4',
  r2c4: '3',
  r2c3: '7',
  r2c2: '4',
  r4c5: '4',
  r4c4: '8',
  r4c3: '1',
  r3c2: '1',
  r4c2: '4',
  r3c1: '1',
  r4c1: '4',
};

const DIV = {
  r0c6: '3',
  r1c0: '1',
  r1c1: '5',
  r2c1: '2',
  r2c2: '4',
  r0c7: '4',
  r3c1: '2',
  r3c2: '0',
  r4c2: '4',
};

// 672 : 3 = 224 (issue #413), step by step: the quotient digit, times, the difference with the
// next digit brought down.
const DIV3 = {
  r0c6: '2',
  r1c0: '6',
  r2c0: '',
  r2c1: '7',
  r0c7: '2',
  r3c0: '',
  r3c1: '6',
  r4c1: '1',
  r4c2: '2',
  r0c8: '4',
  r5c1: '1',
  r5c2: '2',
  r6c2: '0',
};

test('Fehlerdetektiv: tap the wrong line, write it right, judged by code (issue #260)', async ({
  page,
}) => {
  await onboardChild(page, 'find-error');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
  const check = page.getByRole('button', { name: 'Prüfen' });

  // ── four lines, a bracket dissolved the wrong way in the second ──
  await startOffer(page, 'Lass uns Fehler in der Rechnung finden', 'such die Zeile');
  await expect(page.getByText('Finde die falsche Zeile')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await expect(check).toBeDisabled();
  await both(page, '86a-find-error-start');
  // A line below the error: Buddy says to look further up, never which line it is.
  await page.getByRole('radio', { name: /^Zeile 3:/ }).click();
  await check.click();
  await expect(page.getByText('Der Fehler steckt schon weiter oben.')).toBeInViewport();
  await page.getByRole('radio', { name: /^Zeile 2:/ }).click();
  await expect(page.getByTestId('answer-field')).toHaveValue('3x+2 = 21');
  await both(page, '86b-find-error-picked');
  await writeLine(page, '3x + 6 = 21');
  await checkRight(page);

  // ── four long lines: the most a card holds, with Buddy's longest reply above them ──
  await startOffer(page, 'Ich will einen langen Rechenweg prüfen', 'ein langer Rechenweg');
  await expect(page.getByRole('radio')).toHaveCount(3);
  await page.getByRole('radio', { name: /^Zeile 2:/ }).click();
  await writeLine(page, '2x + 5 - 4 = 3x - 5');
  await check.click();
  await expect(page.getByText('Die Zeile hast du gefunden!', { exact: false })).toBeInViewport();
  await both(page, '86c-find-error-long-feedback');
  await writeLine(page, '2x + 6 - 4 = 3x - 5');
  await checkRight(page);
});

test('schriftlich rechnen: every digit and every carry, judged by code (issue #260)', async ({
  page,
}) => {
  await onboardChild(page, 'column');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
  const check = page.getByRole('button', { name: 'Prüfen' });

  // ── 4721 + 1389: a carry left out, named by its column ──
  await startOffer(page, 'Lass uns schriftlich addieren', 'Ziffer für Ziffer');
  await expect(page.getByTestId('column-paper')).toBeVisible();
  await expect(check).toBeDisabled();
  await both(page, '86d-column-add-start');
  await write(page, { ...ADD, r2c4: '' });
  await cellWithKeyboard(page, 'r2c4', '86e-column-add-cell-kb');
  await check.click();
  await expect(
    page.getByText('Noch nicht ganz – bei den Zehnern fehlt noch der Übertrag.'),
  ).toBeInViewport();
  await both(page, '86f-column-add-feedback');
  await write(page, { r2c4: '1' });
  await checkRight(page);

  // ── 5203 − 1874 by Ergänzen: the carries under the subtrahend ──
  await startOffer(page, 'Ich will schriftlich subtrahieren', 'von rechts nach links');
  await write(page, {
    r3c4: '9',
    r2c3: '1',
    r3c3: '2',
    r2c2: '1',
    r3c2: '3',
    r2c1: '1',
    r3c1: '3',
  });
  await both(page, '86g-column-sub-written');
  await checkRight(page);

  // ── 789 · 56: two partial products and their sum ──
  await startOffer(page, 'Lass uns schriftlich malnehmen', 'erst mit der 5');
  await write(page, { ...MUL, r2c3: '1' });
  await check.click();
  await expect(
    page.getByText('Noch nicht ganz – in der 2. Zeile stimmt bei den Hundertern noch etwas nicht.'),
  ).toBeInViewport();
  await both(page, '86h-column-mul-feedback');
  await write(page, { r2c3: '7' });
  await checkRight(page);

  // ── 174 : 5 = 34 R 4: the tallest division, two steps, with Buddy's reply above ──
  await startOffer(page, 'Ich möchte schriftlich teilen', 'Schritt für Schritt');
  await both(page, '86i-column-div-start');
  await write(page, { ...DIV, r3c2: '5' });
  await check.click();
  await expect(
    page.getByText('Noch nicht ganz – im 2. Schritt stimmt das Malnehmen noch nicht.'),
  ).toBeInViewport();
  await both(page, '86j-column-div-feedback');
  await write(page, { r3c2: '0' });
  await checkRight(page);

  // ── 672 : 3 = 224: three steps, the finished ones shrunk, with Buddy's reply above (#413) ──
  await startOffer(page, 'Ich will dreistellig teilen', 'drei Schritte');
  // Only the first step is there to write in; the others come when she gets there.
  await expect(page.getByTestId('column-r1c0')).toBeVisible();
  await expect(page.getByTestId('column-r5c2')).toHaveCount(0);
  await both(page, '86k-column-div3-start');
  await write(page, { ...DIV3, r5c2: '3' });
  await expect(page.getByTestId('column-done')).toHaveCount(4);
  await check.click();
  await expect(
    page.getByText('Noch nicht ganz – im 3. Schritt stimmt das Malnehmen noch nicht.'),
  ).toBeInViewport();
  await both(page, '86l-column-div3-feedback');
  await cellWithKeyboard(page, 'r5c2', '86m-column-div3-cell-kb');
  // A finished step opens again by a tap (#420); a slip there, and she is back in the third step.
  const reopen = (step: number) =>
    page.getByRole('button', { name: `Schritt ${step} bearbeiten` }).click();
  await reopen(1);
  await expect(page.getByTestId('column-r1c0')).toBeFocused();
  await write(page, { r1c0: '9' });
  await reopen(3);
  await expect(page.getByTestId('column-r5c1')).toBeFocused();
  await check.click();
  // Buddy names the first step, and the app opens it with her finger in its first cell.
  await expect(
    page.getByText('Noch nicht ganz – im 1. Schritt stimmt das Malnehmen noch nicht.'),
  ).toBeInViewport();
  await expect(page.getByTestId('column-r1c0')).toBeFocused();
  await both(page, '86n-column-div3-reopened');
  await write(page, { r1c0: '6' });
  await reopen(3);
  await write(page, { r5c2: '2' });
  await checkRight(page);
});
