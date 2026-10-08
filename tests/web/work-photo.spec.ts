// Browser walkthrough of her photographed working (issue #444, step 3 of #221): the camera at the
// start of the answer bar on a calculation, the copy in her field with the line the reading could
// not settle left empty and named, "Prüfen" waiting for it, and — once she has written it — the
// step check by code that names where her way broke. Scripted answers in
// apps/api/src/testing/scenarios/workPhoto.ts. Every stop is shot at both phone sizes, light and
// dark (tests/web/fit.ts).

import { expect, test, type Page } from '@playwright/test';

import { photographed } from './coreLoop';
import { onboardChild, startOffer } from './figureWalk';
import { shot } from './fit';

/** Her exercise book: the working for 2x + 3 = 7, in her hand. */
const NOTEBOOK = `<body style="margin:0; padding:56px 64px; background:#fdfcf6;
  background-image: repeating-linear-gradient(#fdfcf6 0 46px, #b9cfe6 46px 48px);
  font-family: 'Comic Sans MS', 'Segoe Print', cursive; font-size: 34px; line-height: 48px; color:#1d2a6b">
  <div>Nr. 3</div>
  <div>2x + 3 = 7 &nbsp;| −3</div>
  <div>2x = 5 &nbsp;| :2</div>
  <div>x = 2,5</div>
</body>`;

/** The camera at the start of the bar; the photo goes in through the browser's file chooser. */
async function photograph(page: Page, file: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto von deinem Rechenweg' }).click();
  await (await chooser).setFiles(file);
}

const COPY = '2x + 3 = 7 | −3\n\nx = 2,5';

test('her working, photographed: copied into her field, the unread line hers to write, then checked by code (#444)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const photo = await photographed(page, 'working.jpg', NOTEBOOK);
  await onboardChild(page, 'work');
  await startOffer(
    page,
    'Ich will meinen Rechenweg aus dem Heft fotografieren',
    'fotografier mir deinen Weg',
  );
  await expect(page.getByText('Löse die Gleichung 2x + 3 = 7.')).toBeVisible();
  const field = page.getByLabel('Deine Antwort');

  // Before: the calculation with its bar — and the camera where the chat has its +.
  await shot(page, '444a-question');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '444a-question-dark');

  // The copy, in the dark room first: a theme switch remounts the bar, so each room reads anew.
  for (const room of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: room });
    await photograph(page, photo);
    await expect(field).toHaveValue(COPY);
    await expect(
      page.getByText('Zeile 2 konnte ich nicht lesen. Schreib sie selbst hinein.'),
    ).toBeVisible();
    await shot(page, room === 'dark' ? '444b-copy-unread-dark' : '444b-copy-unread');
  }

  // "Prüfen" waits for the line: nothing is sent with a hole in her way.
  await expect(page.getByRole('button', { name: 'Prüfen' })).toBeDisabled();

  // She writes the line from her book; the note asks her to compare the rest.
  const written = '2x + 3 = 7 | −3\n2x = 5 | :2\nx = 2,5';
  await expect(async () => {
    await field.fill(written);
    await expect(field).toHaveValue(written, { timeout: 1000 });
  }).toPass();
  await expect(
    page.getByText('Von deinem Foto abgeschrieben. Stimmt jede Zeile mit deinem Heft?'),
  ).toBeVisible();
  await shot(page, '444c-copy-whole');

  // Checked by code: the step note is read past, the way broke between line 1 and line 2.
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Bis Zeile 1 stimmt alles.', { exact: false }).last()).toBeVisible();
  await expect(page.getByTestId('work-photo-note')).toHaveCount(0);
  await shot(page, '444d-checked');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '444d-checked-dark');
});
