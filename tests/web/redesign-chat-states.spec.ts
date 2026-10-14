// The thread's states against the design (#599; ui_kits/app/Chat.jsx, Gaps.jsx, Extra.jsx,
// Flows.jsx `CHAT_STATES`, App.jsx:125–134): Buddy's lines beside his mini orb (the newest only),
// the typing dots, the receipt chip and the quiet "Zurücknehmen", every offer as the one card,
// the ⋯ menu as one list of six places — from the chat and from an inner screen — and the start
// sheet with the four ways to start. Shot at both phone sizes, Pastell light and dark.
// Scripted model: apps/api/src/testing/scenarios (tour, drill, timedTest, essay, learning-modes).

import { expect, test, type Page } from '@playwright/test';

import { CHAT } from '../../apps/mobile/lib/theme/chat';
import { GUTTER_APP } from '../../apps/mobile/lib/theme/space';
import { freshEmail, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

const PLACES = [
  'Blatt fotografieren',
  'Dein Material',
  'Was Buddy über dich weiß',
  'Verlauf',
  'Einstellungen',
  'Profil',
];
const WAYS = ['Arbeit', 'Hausaufgabe', 'Aussprache', 'Vokabeln'];

/** She says it; Buddy's scripted reply stands in the thread. */
async function say(page: Page, text: string, reply: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(reply, { exact: false }).last()).toBeVisible();
}

/** The rows of the open ⋯ sheet, in their order (its own "Schließen" is not one). */
async function menuRows(page: Page): Promise<string[]> {
  const names = await page
    .locator('[aria-modal="true"]:visible [role="button"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label') ?? ''));
  return names.filter((name) => name !== 'Schließen');
}

/** The newest offer card: full width inside the page margin, with one "Los geht's". */
async function offerCard(page: Page, label: string, title: string): Promise<void> {
  const card = page
    .getByText(title, { exact: true })
    .last()
    .locator('xpath=ancestor::*[contains(@style,"border-radius: 20px")][1]');
  await expect(card.getByText(label, { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: "Los geht's", exact: true })).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(Math.round(box.x), `${title}: the page margin`).toBe(GUTTER_APP);
  expect(Math.round(box.width), `${title}: the thread's whole width`).toBe(
    viewport.width - 2 * GUTTER_APP,
  );
}

for (const look of SCREEN_LOOKS.filter((l) => l.family === 'pastell'))
  test(`Chat states: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(420_000);
    await signUpMia(page, freshEmail('chat-states'));
    const key = await screenLook(page, look);
    const name = (state: string) => `chat-states-${key}-${state}`;

    // ── ⋯ on the first visit: one list, six places, then the way into the start sheet ──
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    // The sheet's rows as they come in: read once it has opened, not in its first frame.
    await expect.poll(() => menuRows(page)).toEqual(['Was willst du üben?', ...PLACES]);
    await screenShots(page, name('menu'), true);
    await page.getByRole('button', { name: 'Was willst du üben?', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Was willst du üben?' })).toBeVisible();
    for (const way of WAYS)
      await expect(page.getByRole('button', { name: way, exact: true })).toBeVisible();
    await screenShots(page, name('start-sheet'), true);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();

    // ── A receipt and its quiet way back; the orb beside Buddy's newest line ──
    await say(page, 'Ich spiele Handball', 'Cool – Handball merke ich mir.');
    const orb = page.getByTestId('thread-orb');
    await expect(orb).toHaveCount(1);
    const line = (await page.getByText('Cool – Handball merke ich mir.').boundingBox())!;
    const mark = (await orb.boundingBox())!;
    expect(Math.round(mark.x), 'the orb stands at the page margin').toBe(GUTTER_APP);
    expect(Math.round(mark.width), 'the mini orb').toBe(CHAT.orb.size);
    expect(Math.round(line.x), 'the line starts past the orb').toBe(GUTTER_APP + CHAT.orb.indent);
    const receipt = (await page.getByText('Gemerkt: Spielt Handball').boundingBox())!;
    expect(receipt.x, 'the receipt hangs under the line’s text').toBeGreaterThan(line.x);
    await expect(page.getByRole('button', { name: 'Zurücknehmen', exact: true })).toHaveCount(1);
    await screenShots(page, name('receipt'));

    // ── The undo sheet keeps its list and its one way out (while the turn is in the thread) ──
    await page.getByRole('button', { name: 'Zurücknehmen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Was du zurücknehmen kannst', exact: true }),
    ).toBeVisible();
    await screenShots(page, name('undo-sheet'), true);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();

    // ── Several of Buddy's lines: the orb moves to the newest, older ones keep the column ──
    await say(page, 'danke', 'Gern!');
    await expect(orb).toHaveCount(1);
    await expect
      .poll(
        async () => {
          const older = await page.getByText('Cool – Handball merke ich mir.').boundingBox();
          const newest = await page.getByText('Gern!', { exact: true }).boundingBox();
          const moved = await orb.boundingBox();
          if (!older || !newest || !moved) return 'not drawn yet';
          if (Math.round(older.x) !== Math.round(newest.x)) return 'lines on two edges';
          return Math.abs(moved.y - newest.y) < 8 ? 'beside the newest' : 'not beside the newest';
        },
        { message: 'older and newest lines share one edge; the orb stands beside the newest' },
      )
      .toBe('beside the newest');
    await screenShots(page, name('lines'));

    // ── Buddy is writing: his mini orb and three dots, never a second orb ──
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/v1/buddy/messages', async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.getByLabel('Schreib Buddy …').fill('tschüss');
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      const typing = page.getByLabel('Buddy schreibt …');
      await expect(typing).toBeVisible();
      await expect(orb).toHaveCount(1);
      expect(Math.round((await orb.boundingBox())!.width), 'the typing orb').toBe(CHAT.typing.orb);
      await screenShots(page, name('typing'));
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(page.getByText('Bis später!')).toBeVisible();

    // ── Every offer is the one card (Flows.jsx:166–180) ──
    await say(
      page,
      'Lass uns Einmaleins üben',
      'Klar – eine schnelle Runde mit den 6ern und 7ern.',
    );
    await offerCard(page, 'Kopfrechnen', 'Einmaleins mit 6 und 7');
    await screenShots(page, name('offer-drill'));
    await say(
      page,
      'Mach einen Probetest zur Photosynthese mit Zeit, wie in der Arbeit',
      'ein Probetest zur Photosynthese',
    );
    await expect(page.getByText('Probetest · mit 10 Minuten', { exact: true })).toBeVisible();
    await screenShots(page, name('offer-test'));
    await say(page, 'Ich will eine Erörterung zum Handyverbot üben', 'schreib deine Erörterung');
    await offerCard(page, 'Aufsatz schreiben', 'Handyverbot an Schulen');
    await screenShots(page, name('offer-essay'));
    await say(page, 'Ich will Brüche vergleichen üben', 'ein paar Fragen zu Brüchen vorbereitet');
    await offerCard(page, 'Üben', 'Brüche vergleichen');
    await screenShots(page, name('offer-practice'));

    // ── ⋯ on an inner screen: the same six places; "Verlauf" is reachable without a URL ──
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.getByRole('button', { name: 'Dein Material', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dein Material', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    // The sheet comes in: its first row is there before the rows are read.
    await expect(
      page.locator('[aria-modal="true"]:visible').getByRole('button', { name: PLACES[0]! }),
    ).toBeVisible();
    expect(await menuRows(page)).toEqual(PLACES);
    await screenShots(page, name('menu-library'), true);
    await page.getByRole('button', { name: 'Verlauf', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    // "Blatt fotografieren" is no page: it takes her back to the chat, whose bar opens the camera.
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Blatt fotografieren', exact: true }).click();
    await chooser;
    await expect(page).toHaveURL(/\/buddy$/);
  });
