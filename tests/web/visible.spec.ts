// What she must see is on the screen — measured, not assumed.
//
// Issue #289: with the keyboard up the welcome form stayed in its roomy layout, so one field sat
// above the pinned CTA and the others, with their errors, under it. The phone keeps its window
// height while she types (edge-to-edge); the app now lays the form out on the VISIBLE height
// (lib/useVisibleHeight.ts, `formDensity` in lib/keyboard.ts — unit-tested with the owner's
// 873/306 numbers). The browser has no keyboard: like modes.spec.ts it gets the room that is left
// (the window less the keyboard), and here every field and every error must stand above the CTA.
// Whether a real keyboard reports that room is the device's to prove (the issue asks for a
// screenshot from the phone).
//
// Issue #294: the attached photo above the field stayed an empty box. The owner measured the
// tile — one flat colour, before and after ten seconds — and this measures it the same way.

import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { PHONES, SHOTS, settle, shot } from './fit';

/** A phone keyboard, as modes.spec.ts has it — plus the owner's POCO X3 from issue #289. */
const KEYBOARD_ROOMS = [
  { name: '390', width: 390, height: 844 - 336 },
  { name: '360', width: 360, height: 740 - 300 },
  { name: 'poco', width: 393, height: 873 - 306 },
] as const;

const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

/** Top and bottom edge of something on the screen. */
async function edges(target: Locator, what: string): Promise<{ top: number; bottom: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${what}: not on the screen`);
  return { top: box.y, bottom: box.y + box.height };
}

/** Everything listed is whole on the screen and above the pinned CTA. */
async function allAboveCta(
  page: Page,
  cta: Locator,
  parts: Record<string, Locator>,
  where: string,
): Promise<void> {
  // The CTA's bar starts SPACE.sm above the button (app/welcome.tsx).
  const bar = (await edges(cta, 'CTA')).top - 8;
  for (const [what, target] of Object.entries(parts)) {
    const { top, bottom } = await edges(target, what);
    expect(top, `${where}: ${what} starts on the screen`).toBeGreaterThanOrEqual(0);
    expect(bottom, `${where}: ${what} ends above the CTA (${Math.round(bar)})`).toBeLessThanOrEqual(
      bar + 0.5,
    );
  }
}

test('the welcome form with the keyboard up: every field and its error above the CTA (#289)', async ({
  page,
}) => {
  await page.goto('/');
  for (const scheme of ['light', 'dark'] as const) {
    // The theme is the app's own choice (stored), as a phone set to dark would have it.
    await page.evaluate((s) => localStorage.setItem('lb.themeMode', s), scheme);
    await page.setViewportSize(PHONES[0]);
    await page.reload();
    await expect(page.getByText('Dein Lernbuddy für Arbeiten und Tests.')).toBeVisible();

    // ── Sign-up: too short a password, a repeat that differs — both errors stand ──
    await page.getByLabel('E-Mail').fill('mia@example.test');
    await page.getByLabel('Passwort', { exact: true }).fill('kurz');
    const repeat = page.getByLabel('Passwort wiederholen');
    await repeat.fill('kurz1');
    await expect(page.getByText('Mindestens 8 Zeichen.')).toBeVisible();
    await expect(page.getByText('Die beiden Passwörter sind noch nicht gleich.')).toBeVisible();
    // The roomy layout at the phones' full size still fits (fit.ts) and reads well (a11y).
    await shot(page, `welcome-errors-${scheme}`);

    const cta = page.getByRole('button', { name: 'Konto erstellen' });
    for (const room of KEYBOARD_ROOMS) {
      await page.setViewportSize(room);
      await repeat.focus();
      await settle(page);
      await page.screenshot({ path: join(SHOTS, `welcome-signup-${scheme}-kb-${room.name}.png`) });
      await allAboveCta(
        page,
        cta,
        {
          'E-Mail': page.getByLabel('E-Mail'),
          Passwort: page.getByLabel('Passwort', { exact: true }),
          'Passwort wiederholen': repeat,
          'its error': page.getByText('Mindestens 8 Zeichen.'),
          'the mismatch': page.getByText('Die beiden Passwörter sind noch nicht gleich.'),
        },
        `sign-up ${scheme} ${room.name}`,
      );
    }

    // ── Sign-in: the hint names the password — and the password field is there to see ──
    await page.setViewportSize(PHONES[0]);
    await page.getByRole('radio', { name: 'Anmelden' }).click();
    await page.getByLabel('Passwort', { exact: true }).fill('');
    const signIn = page.getByRole('button', { name: 'Anmelden', exact: true }).last();
    for (const room of KEYBOARD_ROOMS) {
      await page.setViewportSize(room);
      await page.getByLabel('E-Mail').focus();
      // She taps the muted CTA: the line above it says what is still missing (#97).
      await signIn.click({ force: true });
      await expect(page.getByText('Gib zuerst ein Passwort ein.')).toBeVisible();
      await settle(page);
      await page.screenshot({ path: join(SHOTS, `welcome-signin-${scheme}-kb-${room.name}.png`) });
      await allAboveCta(
        page,
        page.getByText('Gib zuerst ein Passwort ein.'),
        {
          'E-Mail': page.getByLabel('E-Mail'),
          Passwort: page.getByLabel('Passwort', { exact: true }),
        },
        `sign-in ${scheme} ${room.name}`,
      );
    }
    await page.getByRole('radio', { name: 'Neues Konto' }).click();
  }
  await page.evaluate(() => localStorage.removeItem('lb.themeMode'));
});

async function onboardChild(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Ida');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('03');
  await page.getByLabel('Monat', { exact: true }).fill('07');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('2468');
  await page.getByLabel('PIN wiederholen').fill('2468');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await page.getByRole('button', { name: "Los geht's, Ida!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/**
 * How much of the tile is the empty box's own colour — the owner's measurement in issue #294
 * (an empty tile stayed one flat colour). Read from the pixels Chromium drew, in the page,
 * so no image library is needed.
 */
async function emptyShare(page: Page, tile: Locator): Promise<number> {
  const png = (await tile.screenshot()).toString('base64');
  const background = await tile.evaluate((el) => getComputedStyle(el).backgroundColor);
  return page.evaluate(
    async ({ png, background }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d canvas');
      ctx.drawImage(img, 0, 0);
      const [r, g, b] = (background.match(/\d+/g) ?? []).map(Number);
      // Inside the rounded corners only: what lies outside them is the page, not the tile.
      const inset = Math.ceil(img.width * 0.2);
      const data = ctx.getImageData(inset, inset, img.width - 2 * inset, img.height - 2 * inset);
      let same = 0;
      for (let i = 0; i < data.data.length; i += 4) {
        const near =
          Math.abs(data.data[i]! - r!) <= 6 &&
          Math.abs(data.data[i + 1]! - g!) <= 6 &&
          Math.abs(data.data[i + 2]! - b!) <= 6;
        if (near) same += 1;
      }
      return same / (data.data.length / 4);
    },
    { png, background },
  );
}

/** "+" → "Aus der Galerie" → a white worksheet, as the owner did it. */
async function attachSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await settle(page);
  return page.getByTestId('attach-tile');
}

test('an attached photo shows itself in its tile before sending (#294)', async ({ page }) => {
  await onboardChild(page, `visible-${Date.now()}@example.test`);
  // Both rooms; the browser keeps no picked file across a reload, so each attaches its own.
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((s) => localStorage.setItem('lb.themeMode', s), scheme);
    await page.reload();
    await expect(page.getByText('LearnBuddy')).toBeVisible();
    const tile = await attachSheet(page);
    // A sheet of paper fills the tile: next to nothing of it is the empty box's colour. The
    // dark room is the owner's case and the sharp test (white paper on a dark box); in the light
    // room the box itself is nearly white, so only the dark pass measures.
    if (scheme === 'dark') {
      expect(
        await emptyShare(page, tile),
        'share of the tile that is still the empty box',
      ).toBeLessThan(0.2);
    }
    await expect(page.getByText('Vorschau nicht möglich')).toHaveCount(0);
    await shot(page, `attach-tile-${scheme}`);
  }
  await page.evaluate(() => localStorage.removeItem('lb.themeMode'));
});
