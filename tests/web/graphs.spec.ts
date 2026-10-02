// Browser walkthrough of diagrams and trees (issues #247 and #256), against the dev stack with
// the scripted model in apps/api/src/testing/scenarios/graphs.ts. The model supplied only the
// graphs; every question, drawing, board and verdict below is the server's, and no tutor is
// scripted — a wrong answer gets code's own line.
// Screenshots go to test-results/web/shots (390×844 and 360×740, every stop must fit).

import { expect, test, type Page } from '@playwright/test';

import { settle, shot } from './fit';

const START = "Los geht's";

function offerStart(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: START });
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`graphs-${Date.now()}@example.test`);
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

/**
 * Every stop in light AND dark (the app follows the phone's scheme by default): both must fit
 * and both must pass the accessibility check — a figure drawn in light ink only would vanish at
 * night.
 */
async function shots(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
  // The switch back remounts the screen; let it come to rest before anything is typed.
  await settle(page);
}

async function ask(page: Page, text: string, offer: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await offerStart(page, offer).click();
}

test('diagrams and trees: water cycle with two gaps, food chain, tree, pedigree, automaton', async ({
  page,
}) => {
  await onboardChild(page);

  await ask(page, 'Zeig mir Schemata zum Üben', 'Schemata und Bäume zum Lesen');

  // ── Wasserkreislauf mit zwei Lücken (Abnahme #247) ──
  await expect(page.getByText('Was gehört in die leeren Kästchen?')).toBeVisible();
  const figure = page.getByTestId('question-figure');
  await expect(figure).toBeVisible();
  // The screen reader hears the same diagram in words, the empty boxes included.
  await expect(
    page.getByRole('img', { name: /Schema mit 5 Kästchen.*leeres Kästchen 1/ }),
  ).toBeVisible();
  await shots(page, '60-diagram-gaps');
  await page.getByLabel('Begriff bei Kästchen 1, noch leer').fill('Wasserdampf');
  await page.getByLabel('Begriff bei Kästchen 2, noch leer').fill('Schnee');
  // Light only: switching the phone's scheme remounts the screen and clears an unsent board.
  await shot(page, '61-diagram-gaps-filled');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  // One of two holds: partly right, the question stays open, and she fixes only the other.
  await expect(page.getByText('1 von 2', { exact: false }).last()).toBeVisible();
  await page.getByLabel(/Begriff bei Kästchen 2/).fill('Regen');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Nahrungskette ordnen (#228): no drawing, the chain would only repeat the board ──
  await expect(
    page.getByText('Bring die Glieder der Kette in die richtige Reihenfolge.'),
  ).toBeVisible();
  await expect(page.getByTestId('question-figure')).toHaveCount(0);
  for (const step of ['Gras', 'Heuschrecke', 'Frosch', 'Storch']) {
    await page.getByRole('button', { name: `${step}, Element` }).click();
  }
  await shot(page, '62-chain-order');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Baumdiagramm: Pfadwahrscheinlichkeit ──
  await expect(page.getByText('Zweimal Münze werfen', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Baumdiagramm/ })).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('1/2');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  // Wrong for sure, and the line is code's: the tutor never sees the tree.
  await expect(
    page.getByText('Noch nicht ganz. Multipliziere entlang des Pfades', { exact: false }).last(),
  ).toBeVisible();
  await shots(page, '63-prob-tree');
  await page.getByLabel('Deine Antwort').fill('0,25');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Stammbaum: welcher Erbgang? ──
  await expect(page.getByText('Welcher Erbgang passt zu diesem Stammbaum?')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Stammbaum mit 7 Personen.*Person 5: Frau, mit Merkmal/ }),
  ).toBeVisible();
  await shots(page, '64-pedigree');
  await page.getByRole('button', { name: 'autosomal-rezessiv' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Automat und Pfeil-Beschriftung (#256 Informatik, #229 auf einem Kreislauf) ──
  await ask(page, 'Lass uns Automaten üben', 'ein Automat und ein Kreislauf');
  await expect(
    page.getByText('Der Automat startet in q0. Wird das Wort „abb“ akzeptiert?'),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Automat mit 3 Zuständen/ })).toBeVisible();
  await shots(page, '65-automaton');
  await page.getByRole('button', { name: 'Ja, es wird akzeptiert' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Welche Beschriftung gehört zu welchem Pfeil?')).toBeVisible();
  const pairs: [string, string][] = [
    ['Pfeil 1', 'Fotosynthese'],
    ['Pfeil 2', 'Fressen'],
    ['Pfeil 3', 'Absterben'],
    ['Pfeil 4', 'Zersetzung'],
  ];
  await shots(page, '66-diagram-label');
  for (const [left, right] of pairs) {
    await page.getByRole('button', { name: `${left}, noch ohne Paar` }).click();
    await page.getByRole('button', { name: `${right}, noch ohne Paar` }).click();
  }
  await shot(page, '66-diagram-label-set');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
});
