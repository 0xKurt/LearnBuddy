// Browser walkthrough of the pictures whose answer is read off them (issues #254, #255), on the
// same dev stack; scripted tasks in apps/api/src/testing/scenarios/pictures.ts. The model chose
// only the tasks — every question, drawing and key here is the server's (`practice/visual.ts`),
// and every verdict is code's.
//
// Abnahme #254: the clock is SET by tapping on 360×740. Abnahme #255: the walkthrough on 360×740.
// `shot` takes every stop at 390×844 and 360×740 and fails on anything that must be scrolled.

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`pictures-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2017');
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

/** Light, then dark: the same stop in both themes. */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

async function start(page: Page, ask: string, says: string, first: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(ask);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(says, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText(first, { exact: false })).toBeVisible();
}

async function typeAndCheck(page: Page, answer: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  // Typed again until it stays: switching the theme back to light right before re-renders the
  // screen once, and a fill that lands in that moment is lost.
  await expect(async () => {
    await field.fill(answer);
    await expect(field).toHaveValue(answer, { timeout: 1000 });
    await expect(page.getByRole('button', { name: 'Prüfen' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

async function next(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Weiter' }).click();
}

test('Uhr und Geld: set the clock by tapping (#248), read it, lay and count money (issue #254)', async ({
  page,
}) => {
  await onboardChild(page);
  await start(
    page,
    'Lass uns Uhr und Geld üben',
    'erst die Uhr',
    'Stell die Uhr auf Viertel vor acht.',
  );

  // ── Uhr stellen per Tipp: #248's tap task, the one mechanism for tapping in a figure ──
  const check = page.getByRole('button', { name: 'Prüfen' });
  await shot(page, '80-clock-set');
  const face = await page.getByTestId('figure-touch').boundingBox();
  if (!face) throw new Error('no clock face');
  const at = (n: number) => {
    const angle = (n / 12) * 2 * Math.PI;
    const r = face.width * 0.3;
    return {
      x: face.x + face.width / 2 + r * Math.sin(angle),
      y: face.y + face.height / 2 - r * Math.cos(angle),
    };
  };
  // The short hand toward the 7, then the long one to the 9.
  await page.mouse.click(at(7).x, at(7).y);
  await page.mouse.click(at(9).x, at(9).y);
  await expect(page.getByText('Deine Uhrzeit: 7:45 Uhr')).toBeVisible();
  await both(page, '81-clock-set-done');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Uhr lesen: "halb acht" is 7:30 ──
  await expect(page.getByText('Wie spät ist es?')).toBeVisible();
  await both(page, '82-clock-read');
  await typeAndCheck(page, 'halb acht');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Geld legen: 2,80 € with other pieces than the model's ──
  await expect(page.getByText('Lege 2,80 €.')).toBeVisible();
  await expect(check).toBeDisabled();
  for (const piece of ['1 €', '1 €', '50 ct', '20 ct', '10 ct']) {
    await page.getByRole('button', { name: `${piece} hinlegen` }).click();
  }
  // Changed her mind about one piece: a tap takes it back, and lays a smaller one.
  await page.getByRole('button', { name: '10 ct wegnehmen' }).click();
  await page.getByRole('button', { name: '5 ct hinlegen' }).click();
  await page.getByRole('button', { name: '5 ct hinlegen' }).click();
  await both(page, '83-money-lay');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  // The thread reads her coins in words.
  await expect(page.getByText('1 € + 1 € + 50 ct + 20 ct + 5 ct + 5 ct')).toBeVisible();
  await next(page);

  // ── Geld zählen ──
  await expect(page.getByText('Wie viel Geld ist das?')).toBeVisible();
  await both(page, '84-money-count');
  await typeAndCheck(page, '877 ct');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Zwanzigerfeld ──
  await expect(page.getByText('Wie viele Plättchen sind es?')).toBeVisible();
  await both(page, '85-twenty-field');
  await typeAndCheck(page, '13');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Hunderter, Zehner, Einer ──
  await expect(page.getByText('Welche Zahl ist das?')).toBeVisible();
  await both(page, '86-base-ten');
  await typeAndCheck(page, '247');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

test('Körper und Raum: count, measure, fold, read a point (issue #255)', async ({ page }) => {
  await onboardChild(page);
  await start(page, 'Lass uns Körper und Raum üben', 'ein Würfelnetz', 'Wie viele Kanten');

  // ── Kanten zählen: the dashed ones at the back count too ──
  await both(page, '90-solid-edges');
  await typeAndCheck(page, '12');
  await expect(
    page.getByText('Noch nicht ganz – denk auch an die gestrichelten Linien hinten.'),
  ).toBeVisible();
  await typeAndCheck(page, '18');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Volumen eines Zylinders, π = 3,14 counts too ──
  await expect(
    page.getByText('Berechne das Volumen (Zylinder, r = 3 cm, h = 5 cm).', { exact: false }),
  ).toBeVisible();
  await both(page, '91-solid-volume');
  await typeAndCheck(page, '141,3');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Würfelnetz ──
  await expect(page.getByText('Lässt sich dieses Netz zu einem Würfel falten?')).toBeVisible();
  await both(page, '92-cube-net');
  await page.getByRole('button', { name: 'Ja', exact: true }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);

  // ── Punkt im Raum ──
  await expect(page.getByText('Welche Koordinaten hat der Punkt P?')).toBeVisible();
  await both(page, '93-point-3d');
  await typeAndCheck(page, '(2|3|2)');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await next(page);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
