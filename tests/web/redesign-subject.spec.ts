import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, planTest, sendWorksheet, openMenu } from './coreLoop';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { listLookMatrix, listShots } from './redesign-list-matrix';

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
};

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
  // ui_kits/app/More.jsx:70: the subject's tone tile with the sheet sign, the day and what it
  // holds, and at the end the pill with its arrow.
  const row = page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true });
  await expect(row.locator('svg')).toHaveCount(1);
  await expect(row.getByText(/^\d{1,2}\. \S+ · 4 Aufgaben$/)).toBeVisible();
  const practice = page.getByRole('button', { name: '„Brüche kürzen und vergleichen“ üben' });
  await expect(practice.locator('svg')).toHaveCount(1);
  await expect(practice.locator('> div')).toHaveCSS('height', '32px');
  await row.click();
  const sheet = page.locator('[aria-modal="true"]');
  // ui_kits/app/More.jsx:82–87: the sheet carries the sheet's name; only the row that leads
  // somewhere else ends in a chevron, and deleting is in the danger colour.
  await expect(
    sheet.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
  ).toBeVisible();
  const questions = sheet.getByRole('button', { name: 'Fragen ansehen', exact: true });
  await expect(questions).toBeVisible();
  await expect(questions.locator('svg')).toHaveCount(2);
  const remove = sheet.getByRole('button', {
    name: '„Brüche kürzen und vergleichen“ löschen',
    exact: true,
  });
  await expect(remove.locator('svg')).toHaveCount(1);
  await expect(remove.getByText('Löschen', { exact: true })).toHaveCSS(
    'color',
    rgb(paletteOf(themeNameOf('sunset', true)).danger),
  );
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
  // ui_kits/app/Gaps.jsx:44–67: one block at the start edge on the 20 pt gutter.
  const emptyHead = page.getByRole('heading', { name: 'Hier ist gerade nichts', exact: true });
  await expect(emptyHead).toBeVisible();
  await expect(emptyHead).toHaveCSS('font-size', '26px');
  expect((await emptyHead.boundingBox())?.x).toBe(20);
  const capture = page.getByRole('button', { name: 'Neues Blatt fotografieren', exact: true });
  await expect(capture.locator('svg')).toHaveCount(1);
  expect((await capture.boundingBox())?.x).toBe(20);
  await listShots(page, 'redesign-subject-empty');
  await page.goto('/subject/00000000-0000-4000-8000-000000000000');
  const goneHead = page.getByRole('heading', { name: 'Das Fach ist nicht mehr da', exact: true });
  await expect(goneHead).toBeVisible();
  expect((await goneHead.boundingBox())?.x).toBe(20);
  const back = page.getByRole('button', { name: 'Zu deinem Material', exact: true });
  await expect(back.locator('svg')).toHaveCount(0);
  expect((await back.boundingBox())?.x).toBe(20);
  await listShots(page, 'redesign-subject-gone');
  await page.getByRole('button', { name: 'Zu deinem Material', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
});
