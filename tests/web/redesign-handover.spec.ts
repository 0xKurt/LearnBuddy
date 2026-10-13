import { expect, test } from '@playwright/test';
import {
  ONBOARDING_LOOKS,
  onboardingStart,
  onboardingShots,
  childToParent,
  parentToContact,
} from './redesign-onboarding-matrix';
for (const look of ONBOARDING_LOOKS)
  for (const allow of [true, false])
    test(`Handover ${look.family} ${look.dark ? 'dark' : 'light'} ${allow ? 'allow' : 'skip'}`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await onboardingStart(page, look);
      await childToParent(page);
      await parentToContact(page);
      const create = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/learner'),
      );
      await page
        .getByRole('button', { name: allow ? 'Ja, erlauben' : 'Nein, danke', exact: true })
        .click();
      const created = await create;
      expect(created.ok()).toBe(true);
      expect(created.request().postDataJSON()).toMatchObject({
        relation: 'child',
        minor_consent: true,
        contact: allow ? 'yes' : 'no',
      });
      expect(await created.json()).toMatchObject({
        relation: 'child',
        display_name: 'Mia',
        is_minor: true,
      });
      // LearnerView does not contain contact_enabled; its real settings contract does.
      const requestHeaders = await created.request().allHeaders();
      const headers = Object.fromEntries(
        Object.entries(requestHeaders).filter(
          ([key]) => key === 'authorization' || key === 'cookie',
        ),
      );
      const settings = await page.request.get(
        created.url().replace(/\/learner$/, '/buddy/settings'),
        { headers },
      );
      expect(settings.ok()).toBe(true);
      expect(await settings.json()).toMatchObject({ contact_enabled: allow });
      await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
      await expect(page.getByText('Einwilligung zum Datenschutz: erteilt')).toBeVisible();
      await expect(page.getByText('PIN der Eltern: gesetzt – nur ihr kennt sie')).toBeVisible();
      await expect(
        page.getByText(allow ? /Push-Benachrichtigungen: erlaubt/ : /Push-Benachrichtigungen: aus/),
      ).toBeVisible();
      const instruction = page.getByText('Gib Mia jetzt das Handy.', { exact: true });
      const proceed = page.getByRole('button', { name: "Los geht's, Mia!", exact: true });
      await expect(instruction).toBeVisible();
      await expect(instruction).toHaveCSS('text-align', 'center');
      // The scale's title (17/23 · 700) for the design's 700 17/24 (Onboarding.jsx:131, #599).
      await expect(instruction).toHaveCSS('font-size', '17px');
      await expect(instruction).toHaveCSS('line-height', '23px');
      await expect(instruction).toHaveCSS('font-family', /Figtree_700Bold/);
      // What is set stands in bold, its colon included (Onboarding.jsx:141).
      await expect(page.getByText('PIN der Eltern:', { exact: true })).toHaveCSS(
        'font-family',
        /Figtree_700Bold/,
      );
      await expect(page.getByText(/^\d von \d$/)).toHaveCount(0);
      const instructionBox = await instruction.boundingBox();
      const proceedBox = await proceed.boundingBox();
      expect(instructionBox).not.toBeNull();
      expect(proceedBox).not.toBeNull();
      expect(instructionBox!.y + instructionBox!.height).toBeLessThanOrEqual(proceedBox!.y);
      await onboardingShots(page, `handover-${look.family}-${look.dark}-${allow}`, look);
      await page.getByRole('button', { name: "Los geht's, Mia!", exact: true }).click();
      if (process.env.LB_DEV_SPEECH === 'fake')
        await expect(page.getByText('Wie soll Buddy klingen?', { exact: true })).toBeVisible();
      else {
        await expect(page.getByText('Sag es Buddy einfach', { exact: true })).toBeVisible();
        await expect(page.getByText('Wie soll Buddy klingen?', { exact: true })).toHaveCount(0);
      }
    });
