// Browser walkthrough of tasks in parts (issue #297): the situation above every part, the part's
// letter before its question, the task's letters where the topic stands — a Folgefehler: her
// wrong a) carried on correctly in b) counts as right, and the reply says so — and an open part
// („Begründe …") checked against key points: a ✓ per point and one follow-up. Scripted answers in
// apps/api/src/testing/scenarios/taskParts.ts. Every stop is shot at both phone sizes, light and
// dark, and with the keyboard up (tests/web/fit.ts).

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer, typed } from './figureWalk';
import { bothSchemes, shot } from './fit';

/** Her answer in the bar, sent. */
async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Deine Antwort').fill(text);
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

test('a task in parts: the situation stays, a) b) c) in order, and a Folgefehler counts right (#297)', async ({
  page,
}) => {
  // Six stops, most shot six times (two phones and the keyboard, light and dark).
  test.setTimeout(540_000);
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
  await bothSchemes(page, '297a-parts-a');

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

  // c) with the key, then the second task of another subject: physics. Its situation ends its
  // first line at 360 pt with "18 km/h", number and unit together (issue #467).
  await expect(page.getByText('c) Was kostet eine Minute', { exact: false })).toBeVisible();
  await typed(page, '0,3');
  await expect(page.getByText('a) Wie weit fährt er', { exact: false })).toBeVisible();
  await expect(page.getByTestId('task-part-steps')).toHaveAccessibleName(
    'Teilaufgabe a von a, b, c',
  );
  await bothSchemes(page, '297c-parts-ride');

  // a) and b) computed, then c) an open part (#297, step 2): her reasoning, checked against key
  // points — the points nowhere on screen, a ✓ per point and ONE follow-up, no grade.
  await typed(page, '45');
  await typed(page, '3');
  await expect(
    page.getByText('c) Begründe, warum er mit 15 km/h länger braucht', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Ein Radfahrer fährt 2,5 Stunden', { exact: false })).toBeVisible();
  await expect(page.getByText('weniger Kilometer', { exact: false })).toHaveCount(0);
  const reason = 'Er fährt langsamer, er schafft in jeder Stunde weniger Kilometer.';
  await page.getByLabel('Deine Antwort').fill(reason);
  await bothSchemes(page, '297d-parts-open');

  // Filled again: the theme switch above rebuilt the screen.
  await send(page, reason);
  await expect(
    page.getByText('Was ist bei beiden Fahrten gleich?', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Strecke fehlt noch', { exact: false })).toBeVisible();
  await expect(page.getByText('✓ Tempo', { exact: false })).toBeVisible();
  await bothSchemes(page, '297e-parts-open-followup');

  await send(page, 'Die Strecke ist bei beiden gleich lang.');
  await expect(page.getByText('Alles drin', { exact: false })).toBeVisible();
  await expect(page.getByText('✓ Strecke', { exact: false })).toBeVisible();
  // Closed: shot in daylight only (a theme switch rebuilds the screen on the next open question).
  await shot(page, '297f-parts-open-done');
});
