import { expect, test } from '@playwright/test';
import { onboardChild } from './figureWalk';
import { bothSchemes, settle } from './fit';

test('a failed preparation corrects the reply and card, including after reload (#913)', async ({
  page,
}) => {
  await onboardChild(page, 'preparation');
  await page.getByLabel('Schreib Buddy …').fill('Ich will Größen umrechnen üben');
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  const failure = page.getByText(
    'Damit kann ich leider nichts vorbereiten – probier ein Schulthema.',
    { exact: true },
  );
  await expect(failure).toHaveCount(1);
  await expect(
    page.getByText('Die Übung konnte ich leider nicht vorbereiten.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Ich habe dir die Übung zu Größen vorbereitet.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Los geht's", exact: true })).toHaveCount(0);
  await expect(failure).toBeInViewport();
  await bothSchemes(page, 'preparation-refused');
  const refreshed = page.waitForResponse(
    (r) => r.url().endsWith('/v1/buddy') && r.request().method() === 'GET',
  );
  await page.reload();
  await refreshed;
  await expect(failure).toHaveCount(1);
  await expect(
    page.getByText('Die Übung konnte ich leider nicht vorbereiten.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Ich habe dir die Übung zu Größen vorbereitet.', { exact: true }),
  ).toHaveCount(0);
  // A new visit opens on its greeting. Her earlier offer remains in the same conversation.
  await settle(page);
  await failure.scrollIntoViewIfNeeded();
  await expect(failure).toBeInViewport();
  await expect(
    page.getByText('Die Übung konnte ich leider nicht vorbereiten.', { exact: true }),
  ).toBeInViewport();
});
