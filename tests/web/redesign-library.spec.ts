import { SessionView } from '../../packages/shared-types/src/contracts/index';
import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, planTest, sendWorksheet, openMenu } from './coreLoop';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { listLookMatrix, listShots } from './redesign-list-matrix';

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
};

test('redesign Library: empty, real subjects/recent material and independent row actions', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await signUpMia(page, freshEmail('redesign-library'));
  await openMenu(page, 'Dein Material');
  // The empty page (ui_kits/app/Gaps.jsx:44–67): one block at the start edge on the 20 pt
  // gutter, and one action as wide as its words, with the camera.
  const head = page.getByRole('heading', { name: 'Hier landen deine Blätter', exact: true });
  await expect(head).toBeVisible();
  await expect(head).toHaveCSS('font-size', '26px');
  await expect(head).toHaveCSS('font-weight', '800');
  await expect(head).not.toHaveCSS('text-align', 'center');
  const capture = page.getByRole('button', { name: 'Neues Blatt fotografieren', exact: true });
  await expect(capture.locator('svg')).toHaveCount(1);
  const [headBox, captureBox] = [await head.boundingBox(), await capture.boundingBox()];
  expect(headBox?.x).toBe(20);
  expect(captureBox?.x).toBe(20);
  expect(captureBox!.width).toBeLessThan(page.viewportSize()!.width - 40);
  await listShots(page, 'redesign-library-empty');
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await planTest(page);
  await sendWorksheet(page);
  await listLookMatrix(page, '/library', 'Dein Material', 'redesign-library');
  await expect(page.getByText('Fächer', { exact: true })).toBeVisible();
  await expect(page.getByText('Zuletzt', { exact: true })).toBeVisible();
  const row = page.getByRole('button', {
    name: 'Fragen aus „Brüche kürzen und vergleichen“ ansehen',
  });
  const practice = page.getByRole('button', { name: '„Brüche kürzen und vergleichen“ üben' });
  await expect(row).toBeVisible();
  await expect(practice).toBeVisible();
  // ui_kits/app/Library.jsx:8–16,32: no sign before the name, what it holds without a day, and
  // at the end the 32 pt lavender pill with its arrow.
  await expect(row.locator('svg')).toHaveCount(0);
  await expect(row.getByText('4 Aufgaben', { exact: true })).toBeVisible();
  await expect(practice.locator('svg')).toHaveCount(1);
  const pill = practice.locator('> div');
  await expect(pill).toHaveCSS('height', '32px');
  // The matrix above ends in the last look, dark.
  await expect(pill).toHaveCSS(
    'background-color',
    rgb(paletteOf(themeNameOf('sunset', true)).primaryLt),
  );
  expect(
    await practice.evaluate(
      (element) => element.parentElement?.closest('[role="button"],button') !== null,
    ),
  ).toBe(false);
  await row.click();
  await expect(page).toHaveURL(/\/material\//);
  const materialId = new URL(page.url()).pathname.split('/').at(-1);
  expect(materialId).toBeTruthy();
  await expect(
    page.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
  ).toBeVisible();
  await page.goto('/library');
  await page.getByRole('button', { name: /^Mathe: / }).click();
  await expect(page.getByRole('heading', { name: 'Mathe', exact: true })).toBeVisible();
  await page.goto('/library');
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/practice/sessions'),
  );
  await practice.click();
  const response = await started;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ material_id: materialId, mode: 'practice' });
  const session = SessionView.parse(await response.json());
  expect(session.items.length).toBeGreaterThan(0);
  await expect(page).toHaveURL(new RegExp(`/practice/${session.id}$`));
  await expect(page.getByTestId('question-card')).toBeVisible();
});
