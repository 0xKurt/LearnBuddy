// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { freshEmail, planTest, signUpMia, worksheetJpeg, openMenu } from './coreLoop';
import { join } from 'node:path';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';
import captureDe from '../../apps/mobile/locales/de/capture.json';
import { PHONES, settle, shot } from './fit';

/** Whole on screen: inside the viewport and every clipping ancestor (toBeVisible misses clipping). */
async function whole(part: Locator, name: string) {
  const cut = await part.evaluate((element) => {
    const box = element.getBoundingClientRect();
    let top = 0,
      left = 0,
      right = innerWidth,
      bottom = innerHeight;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node),
        clip = node.getBoundingClientRect();
      if (/(hidden|scroll|auto|clip)/.test(style.overflowX)) {
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      if (/(hidden|scroll|auto|clip)/.test(style.overflowY)) {
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
    }
    return {
      size: box.width * box.height,
      top: Math.max(0, top - box.top),
      bottom: Math.max(0, box.bottom - bottom),
      left: Math.max(0, left - box.left),
      right: Math.max(0, box.right - right),
    };
  });
  expect(cut.size, `${name}: drawn`).toBeGreaterThan(0);
  expect(cut, `${name}: whole without scrolling`).toMatchObject({
    top: expect.closeTo(0, 0),
    bottom: expect.closeTo(0, 0),
    left: expect.closeTo(0, 0),
    right: expect.closeTo(0, 0),
  });
}

/** The blurry-photo card stands whole above the field, with its photo (#599 R5). */
async function qualityWhole(page: Page) {
  const size = page.viewportSize()!;
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    const parts = {
      photo: page.getByTestId('attach-tile'),
      title: page.getByRole('heading', { name: 'Foto 1 ist unscharf.', exact: true }),
      detail: page.getByText(captureDe.quality.blurry_tip, { exact: true }),
      retake: page.getByRole('button', { name: 'Neu fotografieren', exact: true }),
      keep: page.getByRole('button', { name: 'Trotzdem behalten', exact: true }),
      field: page.getByTestId('composer').getByRole('textbox'),
    };
    for (const [name, part] of Object.entries(parts)) await whole(part, `${name} @${phone.width}`);
  }
  await page.setViewportSize(size);
}

/** The window a small keyboard leaves on each phone (fit.ts KEYBOARD_ROOM: height − 300), tightest first. */
const KEYBOARD_ROOMS = [...PHONES]
  .sort((a, b) => a.height - b.height)
  .map((phone) => ({ width: phone.width, height: phone.height - 300 }));

/**
 * With the keyboard up the field and its tools stay whole and pinned (rules 16, 19); the pages and
 * the photo check give way: they scroll inside their own area and never cover the card on top.
 */
async function keyboardRoom(page: Page, key: string) {
  const size = page.viewportSize()!;
  const composer = page.getByTestId('composer');
  const field = composer.getByRole('textbox');
  const tools = {
    field,
    attach: composer.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }),
    microphone: composer.getByRole('button', { name: 'Nachricht sprechen', exact: true }),
    send: composer.getByRole('button', { name: 'Senden', exact: true }),
  };
  for (const room of KEYBOARD_ROOMS) {
    const at = `@${room.width}x${room.height}`;
    await page.setViewportSize(room);
    await field.focus();
    // The layout follows the new room a moment later; measured before, everything looks whole.
    await settle(page);
    for (const [name, tool] of Object.entries(tools)) await whole(tool, `${name} ${at}`);
    const pages = composer.getByTestId('scroll-list');
    // Shot from the top, wherever the room before left the area.
    await pages.evaluate((area) => area.scrollTo(0, 0));
    const notice = page.getByRole('button', { name: 'Foto machen', exact: true });
    const top = (await pages.boundingBox())!.y;
    const noticeBox = (await notice.boundingBox())!;
    expect(top, `pages below the card on top ${at}`).toBeGreaterThanOrEqual(
      noticeBox.y + noticeBox.height,
    );
    await shot(page, `capture-${key}-quality-keyboard-${room.width}`, { phones: [room] });
    for (const name of ['Neu fotografieren', 'Trotzdem behalten']) {
      const decision = page.getByRole('button', { name, exact: true });
      await decision.scrollIntoViewIfNeeded();
      await whole(decision, `${name} ${at}, scrolled to`);
    }
    for (const [name, tool] of Object.entries(tools)) await whole(tool, `${name} ${at}, after`);
  }
  await field.blur();
  await page.setViewportSize(size);
}

for (const look of SCREEN_LOOKS) {
  const { family, dark } = look;
  test(`capture · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await signUpMia(page, freshEmail('capture'));
    await screenLook(page, look);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const key = dark ? `${family}Dark` : family;
    await planTest(page);
    const photo = await worksheetJpeg(page);
    let chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
    await (
      await chooser
    ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toBeVisible();
    await qualityWhole(page);
    await keyboardRoom(page, key);
    await screenShots(page, `capture-${key}-quality`);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Neu fotografieren', exact: true }).click();
    await (await chooser).setFiles(photo);
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await screenShots(page, `capture-${key}-preview`);
    await page.getByRole('button', { name: 'Foto 1 von 1', exact: true }).click();
    await expect(
      page.locator('[aria-modal="true"]').getByRole('button', { name: 'Schließen', exact: true }),
    ).toBeVisible();
    await screenShots(page, `capture-${key}-zoom`, true);
    await page
      .locator('[aria-modal="true"]')
      .getByRole('button', { name: 'Schließen', exact: true })
      .click();
    await page.getByRole('button', { name: 'Foto 1 entfernen', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }).click();
    await screenShots(page, `capture-${key}-sources`, true);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Aus (der )?Galerie/ }).click();
    await (await chooser).setFiles(photo);
    const check = page.getByRole('button', { name: 'Senden', exact: true });
    const colour = parseInt(PALETTES[key as keyof typeof PALETTES].primary.slice(1), 16);
    await expect
      .poll(() =>
        check.evaluate((button) => getComputedStyle(button.firstElementChild!).backgroundColor),
      )
      .toBe(`rgb(${colour >> 16}, ${(colour >> 8) & 255}, ${colour & 255})`);
    await check.click();
    await expect(
      page.getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ }),
    ).toBeVisible({ timeout: 30_000 });
    await openMenu(page, 'Dein Material');
    await page.getByRole('button', { name: /^Mathe: / }).click();
    await page
      .getByRole('button', {
        name: 'Brüche kürzen und vergleichen',
        exact: true,
      })
      .click();
    await page
      .locator('[aria-modal="true"]:visible')
      .getByRole('button', { name: 'Fragen ansehen', exact: true })
      .click();
    await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(0);
    await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
    await screenShots(page, `capture-${key}-questions`);
  });
}
