// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test } from '@playwright/test';
import { freshEmail, planTest, signUpMia, worksheetJpeg, openMenu } from './coreLoop';
import { join } from 'node:path';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS) {
  const { family, dark } = look;
  test(`capture · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    page.setDefaultTimeout(20_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await signUpMia(page, freshEmail('capture'));
    await screenLook(page, look);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const key = dark ? `${family}Dark` : family;
    await page.getByRole('button', { name: 'Foto vom Arbeitsblatt', exact: true }).click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(
      page.getByRole('heading', { name: 'Blatt fotografieren', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await screenShots(page, `capture-${key}-empty`);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page).toHaveURL(/\/buddy$/);
    await planTest(page);
    const photo = await worksheetJpeg(page);
    let chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
    await (
      await chooser
    ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toBeVisible();
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
    await screenShots(page, `capture-${key}-sources`);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Aus (der )?Galerie/ }).click();
    await (await chooser).setFiles(photo);
    const check = page.getByRole('button', { name: 'An Buddy senden', exact: true });
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

    await page.goto('/buddy');
    const caption = 'Ich schreibe am Freitag eine Mathearbeit über Brüche.';
    await page.getByLabel('Schreib Buddy …').fill(caption);
    const pdfPage = await page.context().browser()!.newPage();
    await pdfPage.setContent(
      '<h1>Brüche – Übungsblatt</h1><p>Kürze 6/8. Vergleiche 2/3 und 3/5.</p>',
    );
    const pdf = await pdfPage.pdf();
    await pdfPage.close();
    await page.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }).click();
    await expect(page).toHaveURL(/\/capture$/);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Aus Dateien', exact: true }).click();
    await (
      await chooser
    ).setFiles({ name: 'brueche.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByText('1 PDF', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await screenShots(page, `capture-${key}-pdf`);
    const submitPattern = '**/v1/materials/*/submit';
    await page.route(submitPattern, (route) => route.abort('failed'), { times: 1 });
    await page.getByRole('button', { name: 'An Buddy senden', exact: true }).click();
    await expect(page.getByText(/^Keine Verbindung\./)).toBeVisible();
    await screenShots(page, `capture-${key}-upload-error`);
    let release!: () => void;
    let submitted!: () => void;
    const submissionReached = new Promise<void>((done) => {
      submitted = done;
    });
    const held = new Promise<void>((done) => {
      release = done;
    });
    await page.route(
      submitPattern,
      async (route) => {
        submitted();
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    const captionRequests: { text: string; client_message_id: string }[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/buddy/messages') {
        const body = request.postDataJSON();
        if (body.text === caption) captionRequests.push(body);
      }
    });
    await page.getByRole('button', { name: 'An Buddy senden', exact: true }).click();
    await submissionReached;
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page).toHaveURL(/\/buddy$/);
    await expect(page.getByLabel('Schreib Buddy …')).toHaveValue('');
    await page.getByLabel('Schreib Buddy …').fill('Meine neuere Frage');
    const captionResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/v1/buddy/messages' &&
        response.request().postDataJSON()?.text === caption,
    );
    release();
    const deliveredResponse = await captionResponse;
    expect(deliveredResponse.ok()).toBe(true);
    await deliveredResponse.finished();
    await expect.poll(() => captionRequests.length).toBe(1);
    await expect(page.getByLabel('Schreib Buddy …')).toHaveValue('Meine neuere Frage');
    await expect(page).toHaveURL(/\/buddy$/);
    if (family === 'pastell' && !dark) {
      await page.getByLabel('Schreib Buddy …').fill(caption);
      await page.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }).click();
      chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Aus Dateien', exact: true }).click();
      await (
        await chooser
      ).setFiles({ name: 'brueche-retry.pdf', mimeType: 'application/pdf', buffer: pdf });
      await expect(page.getByText('1 PDF', { exact: true })).toBeVisible();
      let loseConfirmation = false;
      await page.route('**/v1/buddy', (route) =>
        loseConfirmation ? route.abort('failed') : route.continue(),
      );
      await page.route(
        '**/v1/buddy/messages',
        async (route) => {
          const stored = await route.fetch();
          expect(stored.ok()).toBe(true);
          await stored.body();
          loseConfirmation = true;
          await route.abort('failed');
        },
        { times: 1 },
      );
      await page.getByRole('button', { name: 'An Buddy senden', exact: true }).click();
      await expect(page).toHaveURL(/\/buddy$/);
      await expect(page.getByLabel('Schreib Buddy …')).toHaveValue(caption);
      expect(captionRequests).toHaveLength(2);
      await page.unroute('**/v1/buddy');
      // The server really stored the original ID; explicit unchanged retry confirms it.
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      await expect(page.getByLabel('Schreib Buddy …')).toHaveValue('');
      expect(captionRequests).toHaveLength(2);
      await screenShots(page, `capture-${key}-confirmed-retry`);
      // A new deliberate same-text intent is not equality-deduplicated.
      await page.getByLabel('Schreib Buddy …').fill(caption);
      const nextResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/v1/buddy/messages',
      );
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      await (await nextResponse).finished();
      await expect.poll(() => captionRequests.length).toBe(3);
      expect(new Set(captionRequests.map((request) => request.client_message_id)).size).toBe(3);
    }
  });
}
