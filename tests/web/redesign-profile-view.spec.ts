// The Profile page (ui_kits/app/Extra.jsx `Profile`) and the two facts she changes herself: the
// language in the settings' "Profil" group, the Bundesland on the Profile page — each a short
// pick in the shared choice sheet and one confirmed PATCH /learner, never a sub-page (#599).
import { MeResponse } from '../../packages/shared-types/src/contracts/index';
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
    const learnerPatch = () =>
      page.waitForResponse(
        (res) => res.url().endsWith('/learner') && res.request().method() === 'PATCH',
      );
    const modal = page.locator('[aria-modal="true"]');

    // ── The language: a row of the settings' "Profil" group ──
    await page.goto('/settings');
    const language = page.getByRole('button', { name: 'Sprache, Deutsch', exact: true });
    await language.scrollIntoViewIfNeeded();
    await language.click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(modal).toHaveCount(1);
    await screenShots(page, `profile-${key}-languages`, true);
    const wrappedNames = await page.getByRole('radio').evaluateAll((radios) =>
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
    // Without a connection nothing changes, and the settings say so where the row is.
    await page.context().setOffline(true);
    await modal.getByRole('radio', { name: 'English', exact: true }).click();
    await expect(
      page.getByText("Keine Verbindung. Check dein Internet und versuch's nochmal.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(language).toBeVisible();
    await screenShots(page, `profile-${key}-save-error`, true);
    await page.context().setOffline(false);
    await language.click();
    await expect(modal.getByRole('radio', { name: 'Deutsch', exact: true })).toBeChecked();
    const englishSave = learnerPatch();
    await modal.getByRole('radio', { name: 'English', exact: true }).click();
    const savedEnglish = await englishSave;
    expect(savedEnglish.ok()).toBe(true);
    expect(savedEnglish.request().postDataJSON()).toEqual({
      locale: 'en',
      version: expect.any(Number),
    });
    // Applied only once confirmed — then the whole screen speaks it, also after a reload.
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.reload();
    const english = page.getByRole('button', { name: 'Language, English', exact: true });
    await english.scrollIntoViewIfNeeded();
    await english.click();
    const germanSave = learnerPatch();
    await modal.getByRole('radio', { name: 'Deutsch', exact: true }).click();
    expect((await germanSave).ok()).toBe(true);
    await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();

    // ── The Profile page ──
    await page.getByRole('button', { name: /^Mia, Profil · /, exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(modal).toHaveCount(0);
    await expect(page.getByText('Mia', { exact: true }).filter({ visible: true })).toHaveCount(2);
    await expect(page.getByText('Über dich', { exact: true })).toBeVisible();
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    // The design's rows only: the language is in the settings, the level has no row beside a class.
    await expect(page.getByText('Sprache', { exact: true }).filter({ visible: true })).toHaveCount(
      0,
    );
    if (me.learner!.grade !== null)
      await expect(
        page.getByText('Lernbereich', { exact: true }).filter({ visible: true }),
      ).toHaveCount(0);
    await screenShots(page, `profile-${key}`, true);

    const region = page.getByRole('button', { name: 'Bundesland, Niedersachsen', exact: true });
    await region.click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(modal).toHaveCount(1);
    await screenShots(page, `profile-${key}-regions`, true);
    const regionSave = learnerPatch();
    await modal.getByRole('radio', { name: 'Bayern', exact: true }).click();
    const savedRegion = await regionSave;
    expect(savedRegion.ok()).toBe(true);
    expect(savedRegion.request().postDataJSON()).toEqual({
      curriculum_region: 'by',
      version: expect.any(Number),
    });
    await expect(
      page.getByRole('button', { name: 'Bundesland, Bayern', exact: true }),
    ).toBeVisible();
    await expect(modal).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Bundesland, Bayern', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Mia', { exact: true }).filter({ visible: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Konto löschen', exact: true }).scrollIntoViewIfNeeded();
    await screenShots(page, `profile-${key}-footer`, true);
    await page.getByRole('button', { name: /^Mathe: / }).click();
    await expect(page.getByRole('heading', { name: 'Mathe', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    // Original App.jsx:103 fixes the Profile header's Back to the settings.
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  });
