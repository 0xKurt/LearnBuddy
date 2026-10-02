// Browser walkthrough of the figure library (issues #250, #252, #261): labelling a plant cell by
// tapping its pins, naming a numbered part of the eye, the periodic table (main groups, and the
// full table through its magnifying first tap), a circuit, logic gates and the colour wheel.
// Real app, real API, scripted model (apps/api/src/testing/scenarios/learning-modes.ts): the
// model only chose drawings, parts, elements and nets — every question, figure and key is code's.
// Every stop is shot at 390×844 and 360×740 and fails when anything would have to be scrolled
// (tests/web/fit.ts).
//
// Where to tap is read off the drawing — the symbols in the table's cells, the names on the
// wheel's fields, the names under a circuit's parts — so the test aims the way she does.

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`library-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2012');
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

async function start(page: Page, say: string, offer: string): Promise<void> {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByLabel('Schreib Buddy …').fill(say);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
}

type Spot = { text: string; x: number; y: number };

/** The words drawn in the tap figure, in page coordinates (the centre of each text). */
async function words(page: Page): Promise<Spot[]> {
  return page.evaluate(() => {
    const layer = document.querySelector('[data-testid="figure-touch"]');
    const svg = layer?.parentElement?.querySelector('svg');
    if (!svg) throw new Error('no figure');
    return [...svg.querySelectorAll('text')].map((t) => {
      const r = t.getBoundingClientRect();
      return { text: t.textContent ?? '', x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  });
}

async function tapWord(page: Page, text: string): Promise<void> {
  const spot = (await words(page)).find((w) => w.text === text);
  expect(spot, `"${text}" drawn in the figure`).toBeTruthy();
  await page.mouse.click(spot!.x, spot!.y);
}

/** The pins of a schematic, in page coordinates, in pin order (the circles with r = 15). */
async function pins(page: Page): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(() => {
    const layer = document.querySelector('[data-testid="figure-touch"]');
    const svg = layer?.parentElement?.querySelector('svg');
    if (!svg) throw new Error('no figure');
    return [...svg.querySelectorAll('circle')]
      .filter((c) => c.getAttribute('r') === '15')
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
  });
}

test('labelling by tapping: a plant cell, the eye (issue #252)', async ({ page }) => {
  await onboardChild(page);
  await start(page, 'Ich will die Zelle beschriften', 'beschrifte mal eine Pflanzenzelle');
  await expect(page.getByText('Tippe auf die Zellwand.')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await expect(check).toBeDisabled();
  await shot(page, '80-label-cell');
  // Pins in pin order: cell wall, nucleus, membrane (left), vacuole, chloroplast (right).
  const p = await pins(page);
  expect(p).toHaveLength(5);
  await page.mouse.click(p[3]!.x, p[3]!.y);
  await expect(page.getByText('Dein Punkt: 4')).toBeVisible();
  await check.click();
  await expect(page.getByText('Das ist: Vakuole.', { exact: false })).toBeVisible();
  await shot(page, '81-label-cell-wrong');
  const again = await pins(page);
  await page.mouse.click(again[0]!.x, again[0]!.y);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Dein Punkt: 1')).toBeVisible();
  await shot(page, '82-label-cell-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // The nucleus, without aiming: "Eingeben" offers the pins as buttons.
  await expect(page.getByText('Tippe auf den Zellkern.')).toBeVisible();
  await page.getByRole('button', { name: 'Eingeben' }).click();
  await page.getByRole('radio', { name: 'Punkt 2' }).click();
  await shot(page, '83-label-cell-exact', { opened: true });
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByTestId('figure-readout')).toHaveText('Dein Punkt: 2');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Weiter' }).click();
    const pinsNow = await pins(page);
    // Membrane, vacuole, chloroplast: pins 3, 4 and 5.
    await page.mouse.click(pinsNow[2 + i]!.x, pinsNow[2 + i]!.y);
    await check.click();
    await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  }
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Naming a numbered part: the eye, with four pins and four names to choose from.
  await expect(page.getByText('Wie heißt Teil 1?')).toBeVisible();
  await shot(page, '84-label-eye-name');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '85-label-eye-name-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Regenbogenhaut' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await shot(page, '86-label-eye-right');
});

test('the periodic table: main groups, a value read off it, the full table (issue #250)', async ({
  page,
}) => {
  await onboardChild(page);
  await start(page, 'Ich will das Periodensystem üben', 'ab ins Periodensystem');
  await expect(page.getByText('Tippe im Periodensystem auf das Element Magnesium.')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await shot(page, '87-periodic-find');
  await tapWord(page, 'Ca');
  await expect(page.getByText('Dein Element: Ca')).toBeVisible();
  await check.click();
  await expect(page.getByText('die Gruppe stimmt schon', { exact: false })).toBeVisible();
  await shot(page, '88-periodic-group-right');
  await tapWord(page, 'Mg');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Dein Element: Mg')).toBeVisible();
  await shot(page, '89-periodic-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Wie viele Valenzelektronen hat ein Atom Schwefel?')).toBeVisible();
  await shot(page, '90-periodic-valence');
  await page.getByRole('textbox').fill('6');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Tippe auf das Element in der 4. Periode, Gruppe 11.')).toBeVisible();
  await shot(page, '91-periodic-full');
  // The full table is too fine for a finger: the first tap magnifies the part she aims at.
  await tapWord(page, 'Cu');
  await expect(page.getByText('Vergrößert – tippe jetzt genau.')).toBeVisible();
  await shot(page, '92-periodic-full-zoomed');
  await tapWord(page, 'Cu');
  await expect(page.getByText('Dein Element: Cu')).toBeVisible();
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
});

test('a circuit, logic gates and the colour wheel (issue #261)', async ({ page }) => {
  await onboardChild(page);
  await start(page, 'Stromkreise und Farben bitte', 'Stromkreise, Gatter und der Farbkreis');
  await expect(page.getByText('Eine Lampe leuchtet nicht. Tippe auf sie.')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await shot(page, '93-circuit-dark-lamp');
  await tapWord(page, 'L2');
  await check.click();
  await expect(page.getByText('Folge dem Strom vom Pluspol aus', { exact: false })).toBeVisible();
  await tapWord(page, 'L1');
  await expect(page.getByText('Deine Lampe: L1')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '94-circuit-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Was zeigt das Amperemeter an?')).toBeVisible();
  await shot(page, '95-circuit-ammeter');
  await page.getByRole('textbox').fill('0,8');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // NOT A, then AND with B: X = ¬A, Q = X ∧ B — the table is computed, every cell checked.
  await expect(page.getByText('Fülle die Wahrheitstabelle aus', { exact: false })).toBeVisible();
  await shot(page, '96-logic-table');
  // Laid across: X and Q are rows, the four cases are columns 2–5.
  const cell = (row: string, col: number) =>
    page.getByLabel(`„${row}“, Spalte ${col}`, { exact: true });
  const x = ['1', '1', '0', '0'];
  const q = ['0', '1', '0', '1'];
  for (let c = 0; c < 4; c++) {
    await cell('X', c + 2).fill(x[c]!);
    await cell('Q', c + 2).fill(q[c]!);
  }
  await check.click();
  await expect(page.getByText('„Q“, Spalte 5', { exact: false })).toBeVisible();
  await shot(page, '97-logic-feedback');
  await cell('Q', 5).fill('0');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Itten's wheel: every field carries its name; the complement of red is the field opposite.
  await expect(page.getByText('Tippe auf die Komplementärfarbe von Rot.')).toBeVisible();
  await shot(page, '98-wheel');
  await tapWord(page, 'Blaugrün');
  await expect(page.getByText('Deine Farbe: Blaugrün')).toBeVisible();
  await check.click();
  await expect(page.getByText('Das ist Blaugrün.', { exact: false })).toBeVisible();
  await tapWord(page, 'Grün');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Deine Farbe: Grün')).toBeVisible();
  await shot(page, '99-wheel-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
});
