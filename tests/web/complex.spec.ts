// Browser walkthrough of tasks with several parts (issue #297), against the dev stack with the
// scripted model of apps/api/src/testing/scenarios/complex-tasks.ts:
//
//   · Buddy writes Mathe and Physik like a class-10 test: the material pinned above the part
//     (for Mathe a text and a graph), a · b · c without a count, Folgefehler — a wrong earlier
//     part carried on correctly counts — and an open part the tutor judges with her results.
//   · A photographed sheet with Chemie and Geschichte becomes two tasks, each whole and in order;
//     Folgefehler again, by code, and a source text that scrolls in itself.
//   · Deutsch: a short story, a figure of speech in a line, a position.
//
// No new route: everything happens on the practice screen that exists (CLAUDE.md rule 16), and
// every stop is measured at 390×844 and 360×740 (`shot`, tests/web/fit.ts).
// Screenshots go to test-results/web/shots.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

const START = "Los geht's";
const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

/** The start button of the offer whose card says `says` (see modes.spec.ts, issue #267). */
function offerStart(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: START });
}

/** A class-10 learner: 15 years old (the scripted sheet is read for her age only). */
async function onboardTenth(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`complex-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await next(page);
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Jana');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2011');
  await next(page);
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Jana!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await next(page);
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

async function ask(page: Page, text: string, reply: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(reply, { exact: false })).toBeVisible();
  await offerStart(page, reply).click();
}

async function type(page: Page, value: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  const check = page.getByRole('button', { name: 'Prüfen' });
  // A theme switch remounts the screen (`shots`): typing into the field that is going away is
  // lost, so it is typed again until "Prüfen" is there to take it.
  await expect(async () => {
    await field.fill(value);
    await expect(check).toBeVisible({ timeout: 1000 });
  }).toPass();
  await check.click();
}

/**
 * On to the next part. A part answered right moves on by itself after a moment; one whose
 * solution was shown waits for "Weiter" — either way the next part is what comes.
 */
async function next(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Weiter' })
    .click({ timeout: 4000 })
    .catch(() => undefined);
}

/** Light, then dark: the same stop in both palettes. */
async function shots(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

const steps = (page: Page) => page.getByTestId('task-steps');

test('Mathe and Physik like a class test: material, a · b · c, Folgefehler (issue #297)', async ({
  page,
}) => {
  await onboardTenth(page);
  await ask(
    page,
    'Gib mir Aufgaben wie in der Arbeit, Physik und Mathe',
    'zwei Aufgaben wie in der Arbeit',
  );

  // ── Mathe: the material above (text and a graph), the part below, a · b · c without a count ──
  await expect(page.getByRole('heading', { name: 'Handytarif' })).toBeVisible();
  await expect(page.getByText('Stelle die Gleichung', { exact: false })).toBeVisible();
  await expect(steps(page)).toHaveAttribute('aria-label', 'Teilaufgabe a');
  await shots(page, '70-complex-graph');
  await type(page, 'y = 0,09x + 9,99');
  await expect(page.getByText('Stimmt – gut gemacht!')).toBeVisible();
  await next(page);
  await expect(page.getByText('Berechne Tims Kosten im Mai.')).toBeVisible();
  // b) wrong: she took 0,105 €/min. Shown, and on.
  await type(page, '22,59');
  await page.getByRole('button', { name: 'Lösung zeigen' }).click();
  await next(page);
  // c) with HER b): 9,99 / 22,59 · 100 = 44,2 % — right, and she is told where to look again.
  await expect(steps(page)).toHaveAttribute('aria-label', 'Teilaufgabe c, erledigt: a, b');
  await type(page, '44,2');
  await expect(page.getByText('Richtig weitergerechnet', { exact: false })).toBeVisible();
  // Light only: a theme switch remounts the screen and it opens the next open part, so a closed
  // part's feedback has no night picture (as in modes.spec.ts, '38-order-feedback').
  await shot(page, '71-complex-folgefehler');
  await next(page);

  // ── Physik: a) wrong, b) carried on correctly with her a) ──
  await expect(page.getByRole('heading', { name: 'Radfahrt' })).toBeVisible();
  await expect(page.getByText('geraden Strecke 100 m in 8 s.')).toBeVisible();
  await shots(page, '72-complex-text');
  await type(page, '12');
  await page.getByRole('button', { name: 'Lösung zeigen' }).click();
  await next(page);
  await expect(
    page.getByText('Berechne mit deinem Ergebnis aus a) die Bewegungsenergie.'),
  ).toBeVisible();
  // The material stayed where it was: one panel for the whole task.
  await expect(page.getByText('geraden Strecke 100 m in 8 s.')).toBeVisible();
  await type(page, '5760');
  await expect(page.getByText('Richtig weitergerechnet', { exact: false })).toBeVisible();
  await next(page);

  // ── c): an open part, the material folded — the heading and a · b · c stay ──
  await expect(page.getByText('Begründe', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Einklappen' }).click();
  await expect(page.getByRole('button', { name: 'Material zeigen' })).toBeVisible();
  await expect(steps(page)).toHaveAttribute('aria-label', 'Teilaufgabe c, erledigt: a, b');
  await shots(page, '73-complex-folded');
  await page.getByRole('button', { name: 'Material zeigen' }).click();
  // The tutor judges it with her results (scripted: it sees part c) and her b)).
  await type(
    page,
    'Weil die Geschwindigkeit im Quadrat eingeht: doppelt so schnell gibt 2² = 4-mal so viel.',
  );
  await expect(
    page.getByText('die Geschwindigkeit steht im Quadrat', { exact: false }),
  ).toBeVisible();
  await next(page);
  await expect(page.getByText('Geschafft!').first()).toBeVisible();
});

test('a photographed sheet with Chemie and Geschichte becomes two whole tasks (issue #297)', async ({
  page,
}) => {
  await onboardTenth(page);
  // Attached in the chat, like every messenger (issue #82).
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await page
    .getByRole('button', { name: /^Übung bereit: Übung Klassenarbeit/ })
    .click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Jetzt üben' }).click();

  // ── Chemie from the photo: the equation, the amount, the mass with HER amount ──
  await expect(page.getByRole('heading', { name: 'Magnesium verbrennt' })).toBeVisible();
  await expect(page.getByText('Stelle die Reaktionsgleichung auf.')).toBeVisible();
  await shots(page, '74-complex-photo-chem');
  await type(page, '2 Mg + O2 -> 2 MgO');
  await expect(page.getByText('Stimmt – gut gemacht!')).toBeVisible();
  await next(page);
  // b) rounded too early: 0,2 instead of 0,198.
  await type(page, '0,2');
  await page.getByRole('button', { name: 'Lösung zeigen' }).click();
  await next(page);
  // c) with HER 0,2: 0,2 · 40,3 = 8,06 g.
  await type(page, '8,06');
  await expect(page.getByText('Richtig weitergerechnet', { exact: false })).toBeVisible();
  await next(page);

  // ── Geschichte: a source of 13 lines that scrolls in itself, and its parts ──
  await expect(page.getByText('Nenne zwei Forderungen', { exact: false })).toBeVisible();
  await expect(page.getByTestId('scroll-text')).toBeVisible();
  await shots(page, '75-complex-photo-source');
});

test('Deutsch: a short story with a figure of speech in a line (issue #297)', async ({ page }) => {
  await onboardTenth(page);
  await ask(page, 'Deutsch wie in der Arbeit bitte', 'Textaufgabe wie in der Deutscharbeit');
  await expect(page.getByRole('heading', { name: 'Der Anruf' })).toBeVisible();
  await type(page, 'auf einen Anruf');
  await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
  await next(page);
  await expect(page.getByText('Welches sprachliche Mittel steht in Z. 4?')).toBeVisible();
  await shots(page, '76-complex-story');
  await page.getByRole('button', { name: 'Metapher' }).click();
  await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
});
