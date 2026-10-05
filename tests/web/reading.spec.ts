// Browser walkthrough of a reading text (Leseverständnis, issue #233): a photographed story
// becomes one group of questions that share the text. The text stands above every question of
// the group with its line numbers, scrolls in its own box (`scroll-text`, the one exception of
// rule 16), folds away and stays folded for the next question; a closed question shows where its
// answer stood. A Belegstelle (#368) is answered IN the text: she taps the lines that back a
// statement, anywhere in it, and the text is then the board at the bottom instead of standing above
// the question. Scripted answers in apps/api/src/testing/scenarios/reading.ts; every verdict below
// is code's. Every state is shot at both phone sizes, light and dark (test-results/web/shots, 97-…).

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`reading-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Ella');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  // Eleven: the age the scripted reading of her page is keyed by (scenarios/reading.ts).
  await page.getByLabel('Tag', { exact: true }).fill('03');
  await page.getByLabel('Monat', { exact: true }).fill('03');
  await page.getByLabel('Jahr', { exact: true }).fill('2015');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Ella!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** This state at both phone sizes, in the light and the dark room. */
async function bothRooms(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('passage')).toBeVisible();
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** The text and the question are on screen at once, and only the text scrolls. */
async function textAndQuestion(page: Page, prompt: string): Promise<void> {
  await expect(page.getByText(prompt)).toBeInViewport();
  await expect(page.getByTestId('scroll-text')).toBeInViewport();
  const scrolls = await page
    .getByTestId('scroll-text')
    .evaluate((el) => el.scrollHeight > el.clientHeight + 2);
  // 20 lines do not fit the box: it scrolls in itself, the screen does not (fit.ts checks that).
  expect(scrolls).toBe(true);
}

/** Her answer typed and checked. */
async function typed(page: Page, text: string): Promise<void> {
  // Right after the switch back from the dark room the field can render once more; fill until
  // the value holds instead of typing into the copy that is about to go.
  const field = page.getByLabel('Deine Antwort');
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
}

const SHORT = 'Womit fährt Mia jeden Morgen zur Schule?';
const CHOICE = 'Wer hilft Mia nach dem Sturz an der Brücke?';
const TRUE_FALSE = 'Mia kam an diesem Tag eine Stunde zu spät in die Schule.';
// A no-break space after "Z.": the reference stays on one line of the screen.
const LATER = 'Was macht Mia seit dem Unfall, wenn der Weg vereist ist (Z.\u00A017–19)?';
const ORDER = 'Bring die Ereignisse in die Reihenfolge der Geschichte.';
const EVIDENCE = 'Mia ist dem Bauern dankbar.';
const EVENTS = [
  'Mia stürzt an der Brücke.',
  'Der Bauer bringt sie zur Schule.',
  'Der Vater holt das Fahrrad ab.',
  'Mia malt ein Bild für den Bauern.',
];

test('a reading text: one text above every question, scrolling alone, folding away', async ({
  page,
}) => {
  await onboardChild(page);
  // Attached in the chat, like every messenger (issue #82).
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible({ timeout: 30_000 });
  // Six questions: the seventh named line 31 of a 20-line text and was never created.
  await expect(page.getByText(/^6 Aufgaben · ca\. \d+ Min\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'Jetzt üben' }).click();
  await expect(page.getByRole('button', { name: 'Der Schulweg' }).first()).toBeVisible();

  const seen = new Set<string>();
  for (let n = 0; n < 6; n++) {
    const on = async (prompt: string) =>
      (await page.getByText(prompt, { exact: true }).count()) > 0 && !seen.has(prompt);
    // The next question has arrived: one not seen yet is on screen.
    await expect(async () => {
      const here = await Promise.all([SHORT, CHOICE, TRUE_FALSE, LATER, ORDER, EVIDENCE].map(on));
      expect(here.some(Boolean)).toBe(true);
    }).toPass();
    if (await on(SHORT)) {
      seen.add(SHORT);
      await textAndQuestion(page, SHORT);
      await bothRooms(page, '97-reading-short');
      // A slip of the pen: what she understood is right (#197).
      await typed(page, 'mit dem Farrad');
      // Closed: the line the answer stood in, tinted and said in words.
      await expect(page.getByTestId('evidence')).toHaveText('Antwort in den Zeilen 2–3');
      // Light only: switching the room rebuilds the screen, which moves on (see the choice).
      await shot(page, '97-reading-short-closed');
    } else if (await on(CHOICE)) {
      seen.add(CHOICE);
      await textAndQuestion(page, CHOICE);
      await bothRooms(page, '97-reading-choice');
      // Answered in the dark room, and the closed state shot there: switching the room rebuilds
      // the screen, which then shows the next open question.
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.getByRole('button', { name: 'ein Bauer mit seinem Traktor' }).click();
      await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
      await expect(page.getByTestId('evidence')).toHaveText('Antwort in den Zeilen 9–10');
      await shot(page, '97-reading-choice-closed-dark');
      await page.emulateMedia({ colorScheme: 'light' });
      // The rebuilt screen stands on the next open question: nothing to move on from.
      await expect(page.getByRole('button', { name: 'Weiter' })).toHaveCount(0);
    } else if (await on(TRUE_FALSE)) {
      seen.add(TRUE_FALSE);
      await textAndQuestion(page, TRUE_FALSE);
      // Folded: one line with its heading, and the question has the room.
      await page.getByRole('button', { name: 'Der Schulweg' }).click();
      await expect(page.getByTestId('scroll-text')).toHaveCount(0);
      await expect(page.getByText('Text zeigen')).toBeVisible();
      await bothRooms(page, '97-reading-folded');
      // Open again for the questions after it: folded stays folded until she opens it.
      await page.getByRole('button', { name: 'Der Schulweg' }).click();
      await expect(page.getByTestId('scroll-text')).toBeVisible();
      await page.getByRole('button', { name: 'Falsch' }).click();
      await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
    } else if (await on(LATER)) {
      seen.add(LATER);
      await expect(page.getByText(LATER)).toBeInViewport();
      await bothRooms(page, '97-reading-lines');
      await typed(page, 'Sie schiebt ihr Fahrrad über die Brücke');
    } else if (await on(ORDER)) {
      seen.add(ORDER);
      await expect(page.getByText(ORDER)).toBeInViewport();
      await bothRooms(page, '97-reading-order');
      for (const event of EVENTS) {
        await page.getByRole('button', { name: `${event}, noch ohne Platz` }).click();
      }
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
    } else if (await on(EVIDENCE)) {
      seen.add(EVIDENCE);
      await belegstelle(page);
    } else {
      throw new Error(`question ${n + 1}: none of the six reading questions is on screen`);
    }
    if (n < 5 && (await page.getByRole('button', { name: 'Weiter' }).count()) > 0)
      await page.getByRole('button', { name: 'Weiter' }).click();
  }
  expect(seen.size).toBe(6);
});

/**
 * A Belegstelle (#368): the statement on the card, the text as the board at the bottom — not a
 * second time above — and she taps its lines anywhere in it; code counts like every marking.
 */
async function belegstelle(page: Page): Promise<void> {
  const line = (n: number) => page.getByRole('checkbox', { name: new RegExp(`^Zeile ${n}:`) });
  await expect(page.getByText(EVIDENCE)).toBeInViewport();
  await expect(page.getByTestId('passage')).toHaveCount(0);
  await expect(page.getByTestId('mark-how')).toHaveText('Tippe die Zeilen an, in denen das steht.');
  // Lines 15–16 stand far down the text: the box scrolls to them, the screen does not.
  await line(9).click();
  await line(15).click();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  const counted = 'Noch nicht ganz: 1 richtig, 1 fehlt noch, 1 zu viel.';
  await expect(page.getByText(counted)).toBeVisible();
  await line(9).click();
  await line(16).click();
  await expect(line(16)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('mark-summary')).toHaveText('Markiert – Z. 15–16');
  await expect(line(16)).toBeInViewport();
  await shot(page, '97-reading-evidence');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '97-reading-evidence-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  // Closed: the text is back above, the lines that back it tinted and said in words.
  await expect(page.getByTestId('evidence')).toHaveText('Antwort in den Zeilen 15–16');
  await shot(page, '97-reading-evidence-closed');
}
