import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, planTest, sendWorksheet, openMenu } from './coreLoop';
import { listLookMatrix, listShots } from './redesign-list-matrix';

test('redesign Subject: real grouped sheets, action/confirmation sheets, empty and gone', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await signUpMia(page, freshEmail('redesign-subject'));
  await planTest(page);
  await sendWorksheet(page);
  await openMenu(page, 'Dein Material');
  await page.getByRole('button', { name: /^Mathe: / }).click();
  const path = new URL(page.url()).pathname;
  await listLookMatrix(page, path, 'Mathe', 'redesign-subject');
  await page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true }).click();
  const sheet = page.locator('[aria-modal="true"]');
  await expect(sheet.getByRole('button', { name: 'Fragen ansehen', exact: true })).toBeVisible();
  await listShots(page, 'redesign-subject-actions', true);
  await sheet
    .getByRole('button', { name: '„Brüche kürzen und vergleichen“ löschen', exact: true })
    .click();
  await expect(page.getByText('Blatt löschen?', { exact: true })).toBeVisible();
  await listShots(page, 'redesign-subject-delete-confirm', true);
  // Cancel must retain the actual stored material and its questions.
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true }),
  ).toBeVisible();
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
  await expect(page).toHaveURL(/\/material\//);
  const materialId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(
    page.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
  ).toBeVisible();
  await page.goto(path);
  await page
    .getByRole('button', {
      name: 'Brüche kürzen und vergleichen',
      exact: true,
    })
    .click();
  await page
    .locator('[aria-modal="true"]:visible')
    .getByRole('button', { name: '„Brüche kürzen und vergleichen“ löschen', exact: true })
    .click();
  // requires live verification in Claude Code session
  // Only the first real DELETE transport fails; retry reaches the actual server.
  const target = `**/v1/materials/${materialId}`;
  let attempts = 0;
  await page.route(target, async (route) => {
    if (route.request().method() === 'DELETE') {
      attempts++;
      if (attempts === 1) {
        await route.abort('failed');
        return;
      }
    }
    await route.continue();
  });
  await page
    .locator('[aria-modal="true"]:visible')
    .getByRole('button', { name: 'Löschen', exact: true })
    .click();
  await expect(
    page
      .locator('[aria-modal="true"]:visible')
      .getByText("Keine Verbindung. Check dein Internet und versuch's nochmal.", { exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(1);
  await listShots(page, 'redesign-subject-delete-error', true);
  const removed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/v1/materials/${materialId}` &&
      response.request().method() === 'DELETE',
  );
  await page
    .locator('[aria-modal="true"]:visible')
    .getByRole('button', { name: 'Löschen', exact: true })
    .click();
  expect((await removed).ok()).toBe(true);
  expect(attempts).toBe(2);
  await page.unroute(target);
  await expect(
    page.getByRole('button', {
      name: 'Brüche kürzen und vergleichen',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toHaveCount(0);
  await page.goto('/subject/unsorted');
  await expect(page.getByText('Hier ist gerade nichts', { exact: true })).toBeVisible();
  await listShots(page, 'redesign-subject-empty');
  await page.goto('/subject/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('Das Fach ist nicht mehr da', { exact: true })).toBeVisible();
  await listShots(page, 'redesign-subject-gone');
  await page.getByRole('button', { name: 'Zu deinem Material', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
});
