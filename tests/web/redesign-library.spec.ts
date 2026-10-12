import { SessionView } from '../../packages/shared-types/src/contracts/index';
import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, planTest, sendWorksheet, openMenu } from './coreLoop';
import { listLookMatrix, listShots } from './redesign-list-matrix';

test('redesign Library: empty, real subjects/recent material and independent row actions', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await signUpMia(page, freshEmail('redesign-library'));
  await openMenu(page, 'Dein Material');
  await expect(page.getByText('Hier landen deine Blätter', { exact: true })).toBeVisible();
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
