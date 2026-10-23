// Run with LB_DEV_READING_STREAM=1: the real API/card, with a model stream the test can release.
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { freshEmail, signUpMia } from './coreLoop';
import { bothSchemes, shot } from './fit';

test.skip(process.env.LB_DEV_READING_STREAM !== '1', 'requires the controlled reading stream');

test('validated sheet questions start early and the card grows while Buddy still reads', async ({
  page,
  request,
}) => {
  const api = `http://localhost:${process.env.LB_API_PORT ?? '8787'}`;
  await signUpMia(page, freshEmail('streamed-reading'));
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (
    await chooser
  ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await bothSchemes(page, '870-before-send');
  await page.getByRole('button', { name: 'Senden' }).click();
  try {
    await expect(page.getByText(/^1 Aufgabe · ca\. \d+ Min\.$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible();
    await bothSchemes(page, '870-first-question');
    expect((await request.post(`${api}/dev-reading/grow`)).status()).toBe(204);
    await expect(page.getByText(/^3 Aufgaben · ca\. \d+ Min\.$/)).toBeVisible();
    await bothSchemes(page, '870-three-questions');
    await page.getByRole('button', { name: 'Jetzt üben' }).click();
    await expect(
      page.getByText('Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.'),
    ).toBeVisible();
    await shot(page, '870-practice-before-stream-end');
  } finally {
    await request.post(`${api}/dev-reading/finish`);
  }
});
