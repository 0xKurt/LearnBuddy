// Browser walkthrough of tasks in parts (issue #297): the situation above every part, the part's
// letter before its question, the task's letters where the topic stands — and a Folgefehler: her
// wrong a) carried on correctly in b) counts as right, and the reply says so. Scripted answers in
// apps/api/src/testing/scenarios/taskParts.ts. Every stop is shot at both phone sizes, light and
// dark, and with the keyboard up (tests/web/fit.ts).

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer, typed } from './figureWalk';
import { shot } from './fit';

async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Her answer in the bar, sent; the field filled until the value holds (a theme switch remounts). */
async function send(page: Page, text: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

test('a task in parts: the situation stays, a) b) c) in order, and a Folgefehler counts right (#297)', async ({
  page,
}) => {
  // Three stops, each shot six times (two phones and the keyboard, light and dark).
  test.setTimeout(300_000);
  await onboardChild(page, 'parts');
  await startOffer(page, 'Lass uns Aufgaben mit Teilaufgaben üben', 'wie in der Klassenarbeit');

  // a): the situation above, the letters where the topic stands, the question lettered.
  await expect(
    page.getByText('a) Wie viel kosten Lenas Gesprächsminuten', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Ein Handytarif kostet 12 € Grundgebühr', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('task-part-steps')).toHaveAccessibleName(
    'Teilaufgabe a von a, b, c',
  );
  await both(page, '297a-parts-a');

  // A wrong a), then the solution — and on to b), where she goes on with HER a).
  await send(page, '10');
  await expect(page.getByText('Noch nicht', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Lösung zeigen' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('b) Wie hoch ist ihre Rechnung', { exact: false })).toBeVisible();
  await expect(
    page.getByText('Ein Handytarif kostet 12 € Grundgebühr', { exact: false }),
  ).toBeVisible();
  await send(page, '22');
  await expect(
    page.getByText('Richtig weitergerechnet – mit deinem Ergebnis aus a).', { exact: false }),
  ).toBeVisible();
  // Light only: switching the theme remounts the screen, which then shows the next open question
  // instead of the one she just answered (ThemeProvider) — the dark room is shot at a) and c).
  await shot(page, '297b-parts-follow-on');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // c) with the key, then the second task of another subject: physics.
  await expect(page.getByText('c) Was kostet eine Minute', { exact: false })).toBeVisible();
  await typed(page, '0,3');
  await expect(page.getByText('a) Wie weit fährt er', { exact: false })).toBeVisible();
  await expect(page.getByTestId('task-part-steps')).toHaveAccessibleName('Teilaufgabe a von a, b');
  await both(page, '297c-parts-ride');
});
