// The proof for `expectSeen` (#738): it fails where `toBeVisible` passes — an element at
// opacity 0, on itself or on an ancestor, as every entrance stood on #734's old head — and it
// passes for an entrance that ends. The first test needs no app; the second simulates the old
// head on the real chat: Buddy's new line under a wrapper held at opacity 0.

import { expect, test } from '@playwright/test';

import { freshEmail, signUpMia } from './coreLoop';
import { expectSeen } from './seen';

test('expectSeen: opacity 0 on the element or an ancestor fails; an entrance that ends passes', async ({
  page,
}) => {
  await page.setContent(`
    <div style="opacity: 0"><p id="under-hidden">Eingetragen: Mathearbeit</p></div>
    <p id="stuck" style="opacity: 0">Titel</p>
    <p id="rising" style="opacity: 0; transition: opacity 300ms">Neue Zeile</p>
    <div style="opacity: 0.5"><p id="dimmed" style="opacity: 0.6">Gedimmt</p></div>
    <script>setTimeout(() => { document.getElementById('rising').style.opacity = '1'; }, 200);</script>
  `);
  for (const id of ['under-hidden', 'stuck']) {
    const target = page.locator(`#${id}`);
    // The gap this helper closes: Playwright calls it visible.
    await expect(target).toBeVisible();
    await expect(expectSeen(target, { timeout: 800 })).rejects.toThrow(/seen, not only visible/);
  }
  await expectSeen(page.locator('#rising'));
  await expectSeen(page.locator('#dimmed'));
});

test('expectSeen: Buddy’s new line under an entrance stuck at opacity 0 (#734 old head) fails', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('seen'));
  await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
  await page.getByRole('button', { name: 'Senden' }).click();
  const line = page.getByText('Cool – Handball merke ich mir.');
  await expectSeen(line);
  // The old head, simulated: the line's entrance wrapper never leaves 0.
  await line.evaluate((el) => el.parentElement?.style.setProperty('opacity', '0', 'important'));
  await expect(line).toBeVisible();
  await expect(expectSeen(line, { timeout: 800 })).rejects.toThrow(/seen, not only visible/);
});
