import { MeResponse } from '../../packages/shared-types/src/contracts/index';
import settingsDe from '../../apps/mobile/locales/de/settings.json';
import { expect, test } from '@playwright/test';
import { freshEmail, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
for (const look of SCREEN_LOOKS)
  test(`Profile facts/persistence: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await signUpMia(page, freshEmail('profile-view'));
    await planTest(page);
    await sendWorksheet(page);
    const key = await screenLook(page, look);
    const meResponse = page.waitForResponse(
      (response) => response.url().endsWith('/v1/me') && response.request().method() === 'GET',
    );
    await page.reload();
    const me = MeResponse.parse(await (await meResponse).json());
    expect(me.learner).not.toBeNull();
    const levelLabel = settingsDe.profile[`level_${me.learner!.level}`];
    await page.goto('/settings');
    await page.getByRole('button', { name: /^Mia, Profil · /, exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    const sheet = page; // A genuine destination page, not a modal subtree.
    await expect(sheet.getByText('Mia', { exact: true }).filter({ visible: true })).toHaveCount(2);
    await expect(sheet.getByText(levelLabel, { exact: true })).toBeVisible();
    await expect(
      sheet.getByRole('button', { name: 'Sprache, Deutsch', exact: true }),
    ).toBeVisible();
    await screenShots(page, `profile-${key}`, true);
    await sheet.getByRole('button', { name: 'Sprache, Deutsch', exact: true }).click();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await screenShots(page, `profile-${key}-languages`, true);
    const wrappedNames = await sheet.getByRole('radio').evaluateAll((radios) =>
      radios.flatMap((radio) => {
        const walker = document.createTreeWalker(radio, NodeFilter.SHOW_TEXT);
        const issues: string[] = [];
        while (walker.nextNode()) {
          const text = walker.currentNode;
          if (!text.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(text);
          if (range.getClientRects().length > 1) issues.push(text.textContent);
        }
        return issues;
      }),
    );
    expect(wrappedNames, 'whole language names remain on one line').toEqual([]);
    await page.context().setOffline(true);
    await sheet.getByRole('radio', { name: 'English', exact: true }).click();
    await expect(
      sheet.getByText("Keine Verbindung. Check dein Internet und versuch's nochmal.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(sheet.getByRole('radio', { name: 'Deutsch', exact: true })).toBeChecked();
    await screenShots(page, `profile-${key}-save-error`, true);
    await page.context().setOffline(false);
    const englishSave = page.waitForResponse(
      (res) => res.url().endsWith('/learner') && res.request().method() === 'PATCH',
    );
    await sheet.getByRole('radio', { name: 'English', exact: true }).click();
    const savedEnglish = await englishSave;
    expect(savedEnglish.ok()).toBe(true);
    expect(savedEnglish.request().postDataJSON()).toEqual({
      locale: 'en',
      version: expect.any(Number),
    });
    await expect(sheet.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
    await page.reload();
    await expect(sheet.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Language, English', exact: true }),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Language, English', exact: true }).click();
    const germanSave = page.waitForResponse(
      (res) => res.url().endsWith('/learner') && res.request().method() === 'PATCH',
    );
    await sheet.getByRole('radio', { name: 'Deutsch', exact: true }).click();
    expect((await germanSave).ok()).toBe(true);
    await sheet.getByRole('button', { name: 'Zurück', exact: true }).click();
    await sheet.getByRole('button', { name: /Bundesland/ }).click();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await screenShots(page, `profile-${key}-regions`, true);
    const regionSave = page.waitForResponse(
      (res) => res.url().endsWith('/learner') && res.request().method() === 'PATCH',
    );
    await page.getByRole('radio', { name: 'Bayern', exact: true }).click();
    const savedRegion = await regionSave;
    expect(savedRegion.ok()).toBe(true);
    expect(savedRegion.request().postDataJSON()).toEqual({
      curriculum_region: 'by',
      version: expect.any(Number),
    });
    await expect(sheet.getByRole('radio', { name: 'Bayern', exact: true })).toBeChecked();
    await sheet.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(sheet.getByRole('button', { name: /Bayern/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Bayern/ })).toBeVisible();
    await expect(sheet.getByText('Mia', { exact: true }).filter({ visible: true })).toHaveCount(2);
    await expect(sheet.getByText(levelLabel, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Konto löschen', exact: true }).scrollIntoViewIfNeeded();
    await screenShots(page, `profile-${key}-footer`, true);
    await sheet.getByRole('button', { name: /^Mathe: / }).click();
    await expect(page.getByRole('heading', { name: 'Mathe', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
    // Original App.jsx:103 fixes factual Profile header Back to Settings; editor and
    // browser Back retain their separate factual-profile/native-history behavior.
    await page.goto('/settings/profile?editor=region');
    await expect(page.getByRole('radio', { name: 'Bayern', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  });
