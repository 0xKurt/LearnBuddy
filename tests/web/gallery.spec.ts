// The stops of the final gallery (issue #387) that no other walkthrough reaches, against the real
// API with the scripted model:
//   - code tasks (#262): a program's output, the failing line, a function she writes, a query —
//     each open and closed, judged by the sandbox, never by the model;
//   - a talk (#264): Buddy's plan up to the day, the rehearsal card, the result of a Probevortrag
//     and of reading aloud, measured by code;
//   - tasks in parts with material (#297): a table, a chart and a long historical source above the
//     parts;
//   - „Anders erklären" with a picture (#298): the closed question, then the explanation with its
//     graph;
//   - the routes no other spec stops at: the parents' PIN, the update screen, a deletion running.
// Scripted answers: apps/api/src/testing/scenarios/{code,talks,taskSubjects,explainFigure}.ts.
// Every stop is shot at both phone sizes and measured (`shot`, tests/web/fit.ts).

import { expect, test, type Page } from '@playwright/test';

import { openMenu } from './coreLoop';
import { onboardChild, startOffer } from './figureWalk';
import { shot } from './fit';

/** Her answer in the bar, sent. */
async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Deine Antwort').fill(text);
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

/** A right answer is closed; on to the next question. */
async function next(page: Page): Promise<void> {
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

test('code tasks: output, the failing line, a function and a query, run by the sandbox (#262)', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await onboardChild(page, 'code');
  await startOffer(page, 'Lass uns Programme und Abfragen üben', 'vier Aufgaben am Code');

  // What the program prints: the simple one, its lines numbered.
  await expect(page.getByText('summe = summe + i', { exact: false })).toBeVisible();
  await shot(page, '262a-code-predict');
  await send(page, '1\n3\n6');
  await shot(page, '262b-code-predict-right');
  await next(page);

  // The line that fails: she taps it.
  await expect(page.getByText('print(8 / w)', { exact: false })).toBeVisible();
  await shot(page, '262c-code-find-line');
  await page.getByRole('button', { name: /^Zeile 3/ }).click();
  await next(page);

  // A function against test cases: a wrong one first — code names the case that fails.
  await expect(page.getByText('verdoppeln', { exact: false }).first()).toBeVisible();
  // A tap on the field puts the function's first line in (#262); she writes the rest.
  await page.getByLabel('Deine Antwort').click();
  await expect(page.getByLabel('Deine Antwort')).toHaveValue(/^def verdoppeln\(zahl\):/);
  await page.getByLabel('Deine Antwort').fill('def verdoppeln(zahl):\n    return zahl + 2');
  await shot(page, '262d-code-write');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  // Code names the case that fails, never a model (#262).
  await expect(page.getByText('1 von 4 Tests bestanden', { exact: false })).toBeVisible();
  await shot(page, '262e-code-write-feedback');
  await send(page, 'def verdoppeln(zahl):\n    return zahl * 2');
  await next(page);

  // A query on a small table: the complex one.
  await expect(page.getByText('Klasse 7a', { exact: false })).toBeVisible();
  await page.getByLabel('Deine Antwort').fill("SELECT name FROM schueler WHERE klasse = '7a'");
  await shot(page, '262f-code-query');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await shot(page, '262g-code-query-right');
});

/** Records a few seconds on the rehearsal card and waits for Buddy's measured result. */
async function rehearse(page: Page, result: string): Promise<void> {
  await page.getByRole('button', { name: 'Aufnahme starten' }).last().click();
  // Long enough for a believable pace with the scripted transcript (about 100 words a minute).
  await page.waitForTimeout(12_000);
  await page.getByRole('button', { name: 'Fertig' }).last().click();
  await expect(page.getByText(result, { exact: false }).last()).toBeVisible({ timeout: 30_000 });
}

test('a talk: the plan up to the day, a Probevortrag and reading aloud, measured by code (#264)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await onboardChild(page, 'talk');
  const say = async (text: string) => {
    await page.getByLabel('Schreib Buddy …').fill(text);
    await page.getByRole('button', { name: 'Senden' }).click();
  };
  await say('Ich halte in zwei Wochen ein Referat über Vulkane, 5 Minuten.');
  await expect(page.getByText('Vortrag „Vulkane“', { exact: false })).toBeVisible();
  await shot(page, '264a-talk-planned');
  await say('Kann ich einen Probevortrag halten?');
  await expect(page.getByRole('button', { name: 'Aufnahme starten' })).toBeVisible();
  await shot(page, '264b-rehearse-card');
  await rehearse(page, 'Pausenlaute');
  await shot(page, '264c-rehearse-result');
  await say('Ich möchte vorlesen üben.');
  await expect(page.getByTestId('rehearse-text').last()).toHaveText(/Der kleine Fuchs/);
  await shot(page, '264d-read-aloud-card');
  await rehearse(page, 'Wörter zum Üben');
  await shot(page, '264e-read-aloud-result');
});

test('tasks in parts with material: a table, a chart and a long source above the parts (#297)', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await onboardChild(page, 'material');
  await startOffer(page, 'Lass uns Aufgaben mit Material üben', 'einmal mit Tabelle');

  // A table of measured values, then b) goes on from a).
  await expect(page.getByText('a) Wie weit ist der Wagen', { exact: false })).toBeVisible();
  await shot(page, '297k-material-table');
  await send(page, '6');
  await next(page);
  await send(page, '2');
  await next(page);
  await send(page, '20');
  await next(page);

  // A line chart: the value she reads off is checked by code.
  await expect(page.getByText('a) Wie viele Menschen lebten 2020', { exact: false })).toBeVisible();
  await shot(page, '297l-material-chart');
  await send(page, '3,7');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await shot(page, '297m-material-chart-right');
  await page.getByRole('button', { name: 'Übung beenden' }).click();

  // A historical source of more than 300 characters: it scrolls in its own box.
  await startOffer(page, 'Ich möchte eine Quellenaufgabe üben', 'eine Quelle aus der Weimarer');
  await expect(page.getByText('a) Wer darf nach diesem Artikel', { exact: false })).toBeVisible();
  await shot(page, '297n-material-source');
});

test('the routes no other walkthrough stops at: the PIN, an update, a deletion running (#387)', async ({
  page,
}) => {
  await onboardChild(page, 'routes');
  // The parents' PIN, as a step asks for it.
  await openMenu(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'PIN vergessen?' })).toBeVisible();
  await shot(page, '387-route-pin');
  await page.getByRole('button', { name: 'Abbrechen' }).last().click();
  // The screens the app is sent to by the API's answer (426, a deletion running), opened by link.
  await page.goto('/update');
  await expect(page.getByText('Einmal aktualisieren, bitte')).toBeVisible();
  await shot(page, '387-route-update');
  await page.goto('/deleting');
  await expect(page.getByText('Dein Konto wird gerade gelöscht')).toBeVisible();
  await shot(page, '387-route-deleting');
});

test('„Anders erklären" with a picture: the closed question, then the graph (#298)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await onboardChild(page, 'explain-figure');
  await startOffer(page, 'Ich will den Streckfaktor üben', 'mit Bild');
  // A wrong try first: after a clean first try there is nothing to explain again (#61).
  await page.getByRole('button', { name: 'Er wird breiter.' }).click();
  await expect(page.getByText('Noch nicht', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Er wird schmaler.' }).click();
  await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
  await shot(page, '298e-closed-choice');
  await page.getByRole('button', { name: 'Mit Beispiel' }).click();
  // The explanation with its graph is taller than the room above the options and „Weiter": it is
  // read through from its top, like the feedback on a long text (`readsThrough`, #387) — drawn
  // only whole, it did not stand in the picture at all.
  await expect(
    page.getByText('desto schmaler wird die Parabel', { exact: false }).last(),
  ).toBeInViewport();
  await shot(page, '298f-reexplain-figure');
});
