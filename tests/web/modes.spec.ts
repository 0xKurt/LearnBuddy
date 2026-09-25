// Browser walkthrough of the learning modes (after core-loop.spec.ts, same dev
// stack; scripted answers in apps/api/src/testing/scenarios/learning-modes.ts):
// "Erklär mir …", homework help with hints only, practice without a photo with
// math and a figure. Screenshots go to test-results/web/shots.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SHOTS = join(__dirname, '../../test-results/web/shots');

async function shot(page: Page, name: string, height = 1500): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: size?.width ?? 390, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  if (size) await page.setViewportSize(size);
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`modes-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByLabel('TT').fill('10');
  await page.getByLabel('MM').fill('02');
  await page.getByLabel('JJJJ').fill('2014');
  await page.getByRole('checkbox').click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
}

test('learning modes: explain, homework help without the solution, practice with math', async ({
  page,
}) => {
  await onboardChild(page);
  await expect(page.getByText('Was willst du machen?')).toBeVisible();
  await shot(page, '20-home-start-row');

  // ── "Erklär mir was" → explanation, then questions ──
  await page.getByRole('button', { name: 'Erklär mir was' }).click();
  await expect(page.getByText('Was soll ich dir erklären?')).toBeVisible();
  await page.getByRole('textbox').last().fill('den Dativ, ich check das nicht');
  await shot(page, '21-explain-sheet');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Du findest ihn mit der Frage „Wem?“', { exact: false }),
  ).toBeVisible();
  await shot(page, '22-explain-intro');
  await page.getByRole('button', { name: 'Verstanden – frag mich!' }).click();
  await page.getByRole('button', { name: 'Wem?', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel('Deine Antwort').fill('der');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Auf Anhieb richtig')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Homework help: hints only, no "show solution", solved by herself ──
  await page.getByRole('button', { name: 'Hilfe bei Hausaufgaben' }).click();
  await page.getByRole('button', { name: 'Aufgabe eintippen' }).click();
  await expect(page.getByText('Welche Aufgabe? Schreib sie ab.')).toBeVisible();
  await page
    .getByRole('textbox')
    .last()
    .fill('Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
  await page.getByLabel('Deine Antwort').fill('keine Ahnung');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Welche zwei Längen kennst du vom Rechteck?')).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('11');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText(/Länge .*mal.* Breite/)).toBeVisible();
  await shot(page, '23-homework-hints');
  await page.getByLabel('Deine Antwort').fill('28');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Selbst gelöst!', { exact: true })).toBeVisible();
  await expect(page.getByText('Stark – das hast du selbst gelöst!')).toBeVisible();
  await shot(page, '24-homework-solved');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Hausaufgabe geschafft')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Practice without a photo: fractions drawn, math rendered ──
  await page.getByRole('button', { name: 'Üben', exact: true }).click();
  await page.getByRole('textbox').last().fill('Brüche vergleichen');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Frage von Buddy')).toBeVisible();
  await shot(page, '25-practice-fractions');
});
