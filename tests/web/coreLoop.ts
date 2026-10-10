// The core loop's shared steps (issue #381). The loop used to be one spec of almost three
// minutes against a 180 s limit; it is split into scenarios that each start from a fresh
// learner and bring their own way there (Engineering-Regel 7). A scenario checks its own part
// in full (core-loop-*.spec.ts); the steps before it come from here, with no shots — the
// scenario that owns a step shoots and checks it. The scripted model answers by what was
// said and sent (apps/api/src/testing/scenarios/core-loop.ts), so every scenario may say the
// same things again.

import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

import { SHOTS } from './fit';

export const PIN = '4826';

/** A fresh learner for each scenario: nothing is shared between specs. */
export function freshEmail(scenario: string): string {
  return `core-${scenario}-${Date.now()}@example.test`;
}

/** Where the mark and the way into everything else stand on Buddy's home (card or not). */
export async function homePositions(page: Page): Promise<number[]> {
  const ys: number[] = [];
  for (const target of [page.getByText('LearnBuddy'), page.getByRole('button', { name: 'Mehr' })]) {
    const box = await target.boundingBox();
    if (!box) throw new Error('not on the screen');
    ys.push(Math.round(box.y));
  }
  return ys;
}

/**
 * A page "photographed": the HTML rendered by the browser itself and saved as a JPEG under
 * `file`; returns its path. A phone photo is big: 1600 × 2000 pixels (800 × 1000 at twice the
 * density).
 */
export async function photographed(page: Page, file: string, html: string): Promise<string> {
  const path = join(SHOTS, '..', file);
  const sheet = await page
    .context()
    .browser()!
    .newPage({
      viewport: { width: 800, height: 1000 },
      deviceScaleFactor: 2,
    });
  await sheet.setContent(html);
  await sheet.screenshot({ path, type: 'jpeg', quality: 80 });
  await sheet.close();
  return path;
}

/** A photographed "worksheet"; returns its path. */
export function worksheetJpeg(page: Page): Promise<string> {
  return photographed(
    page,
    'worksheet.jpg',
    `<body style="font-family: Georgia, serif; padding: 48px; background: #fffef8">
      <h1>Brüche – Übungsblatt</h1>
      <ol style="font-size: 26px; line-height: 2">
        <li>Kürze 6/8.</li>
        <li>Welcher Bruch ist größer: 2/3 oder 3/5?</li>
        <li>Wie heißt die Zahl unter dem Bruchstrich?</li>
        <li>Warum bleibt der Wert beim Erweitern gleich?</li>
      </ol>
    </body>`,
  );
}

/**
 * A parent sets up the account for Mia (7th grade, Niedersachsen) and allows notifications right
 * after the PIN (issue #518); she skips the first-start cards. No voice step: this stack has no
 * natural voices (issue #526). core-loop-setup.spec.ts walks the same way with every check and
 * shot.
 */
export async function signUpMia(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('14');
  await page.getByLabel('Monat', { exact: true }).fill('03');
  await page.getByLabel('Jahr', { exact: true }).fill('2013');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill(PIN);
  await page.getByLabel('PIN wiederholen').fill(PIN);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Ja, erlauben' }).click();
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** "Ich schreibe am Freitag eine Mathearbeit über Brüche." — the test is entered. */
export async function planTest(page: Page): Promise<void> {
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Ich schreibe am Freitag eine Mathearbeit über Brüche.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(/Eingetragen: Mathearbeit Brüche am/)).toBeVisible();
}

/** The worksheet photographed and sent; Buddy prepares practice from it by himself. */
export async function sendWorksheet(page: Page): Promise<void> {
  const photo = await worksheetJpeg(page);
  // The card's "Foto machen" opens the camera at once, the page lands in the chat (#519).
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ }),
  ).toBeVisible({ timeout: 30_000 });
}

const ANSWERS: Array<{ prompt: string | RegExp; answer: string; choice?: true }> = [
  { prompt: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.', answer: '0,75' },
  // The fractions are set (issue #521): the stem reads on, the option is named as it is heard.
  { prompt: /^Welcher Bruch ist größer:/, answer: '2 Drittel', choice: true },
  { prompt: 'Wie heißt die Zahl unter dem Bruchstrich?', answer: 'Nenner' },
  {
    prompt: 'Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?',
    answer: 'Damit der Wert gleich bleibt.',
  },
];

/**
 * The prepared practice, every question right at the first try, ending on the summary.
 * `answered` runs on each checked answer before "Weiter" (the practice scenario shoots there).
 */
export async function practise(
  page: Page,
  answered?: (n: number, choice: boolean) => Promise<void>,
): Promise<void> {
  await page.getByRole('button', { name: 'Jetzt üben' }).click();
  for (let n = 1; n <= ANSWERS.length; n++) {
    await expect(page.getByText(`Frage ${n} von ${ANSWERS.length}`)).toBeVisible();
    let current: (typeof ANSWERS)[number] | undefined;
    for (const a of ANSWERS)
      if (await page.getByText(a.prompt, { exact: true }).first().isVisible()) current = a;
    if (!current) throw new Error(`no known question on screen (question ${n})`);
    if (current.choice) {
      await page.getByRole('button', { name: current.answer, exact: true }).click();
    } else {
      await page.getByLabel('Deine Antwort').fill(current.answer);
      await page.getByRole('button', { name: 'Prüfen' }).click();
    }
    await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
    // Her right answer stands once — as her own bubble; no "Lösung" card repeats
    // the word she just wrote herself (issue #93).
    await expect(page.getByText('Lösung', { exact: true })).toHaveCount(0);
    if (answered) await answered(n, current.choice === true);
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
  await expect(page.getByText('Alles saß gleich beim ersten Mal', { exact: false })).toBeVisible();
}

/** "Mach die Übungen bitte kürzer." — Buddy remembers it. */
export async function askShorter(page: Page): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill('Mach die Übungen bitte kürzer.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
}

/** One tap into ⋯ and one item in it. */
export async function openMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('button', { name: item }).click();
}
