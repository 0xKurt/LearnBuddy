// Theme foundation: real foreground changes, shipped fonts and small-phone layout.
import { expect, test, type Page } from '@playwright/test';

import { freshEmail, openMenu, planTest, signUpMia } from './coreLoop';
import { PHONES, shot } from './fit';

async function touchTargets(page: Page): Promise<void> {
  const small = await page
    .locator('[role="button"], [role="radio"], [role="switch"], input')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        // Hidden native visuals inside a web control are decoration; the outer
        // accessible switch is the actual keyboard, screen-reader and pointer target.
        if (element.closest('[aria-hidden="true"]')) return [];
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) return [];
        return box.width < 43.5 || box.height < 43.5
          ? [
              `${element.getAttribute('aria-label') ?? element.textContent}: ${box.width}×${box.height}`,
            ]
          : [];
      }),
    );
  expect.soft(small, 'visible controls have 44pt touch targets').toEqual([]);
}

async function motionSamples(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const values: string[] = [];
    for (let i = 0; i < 3; i++) {
      values.push(
        Array.from(document.querySelectorAll<HTMLElement>('[style*="transform"]'))
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => element.style.transform)
          .join('|'),
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return values;
  });
}

test('theme foundation: fonts and live reduced motion for message entrances', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByLabel('E-Mail')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const families = [
          'Figtree_400Regular',
          'Figtree_500Medium',
          'Figtree_600SemiBold',
          'Figtree_700Bold',
          'Figtree_800ExtraBold',
        ];
        // Web FontFace assets load lazily until their weight is used. Exercise each
        // registered shipped face, so missing or broken assets cannot pass silently.
        await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
        return families.every((family) =>
          Array.from(document.fonts).some(
            (font) => font.family.replaceAll('"', '') === family && font.status === 'loaded',
          ),
        );
      }),
    )
    .toBe(true);
  await expect(page.getByLabel('E-Mail')).toHaveCSS('font-family', /Figtree/);
  expect(
    new Set(await motionSamples(page)).size,
    'idle decoration actually animates',
  ).toBeGreaterThan(1);
  // The owner explicitly preserves Buddy's moon heartbeat (orbRoom.ts).
  // Live reduced motion is checked on message entrances below, not that loop.
  await shot(page, 'theme-welcome-fonts');
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await touchTargets(page);
  }

  await signUpMia(page, freshEmail('theme'));
  await page.evaluate(() => {
    document.documentElement.dataset.themeAnimations = '[]';
    document.addEventListener(
      'animationstart',
      (event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const durations: number[] = JSON.parse(
          document.documentElement.dataset.themeAnimations ?? '[]',
        );
        durations.push(parseFloat(getComputedStyle(event.target).animationDuration));
        document.documentElement.dataset.themeAnimations = JSON.stringify(durations);
      },
      true,
    );
  });
  await planTest(page);
  const durations = () =>
    page.evaluate((): number[] =>
      JSON.parse(document.documentElement.dataset.themeAnimations ?? '[]'),
    );
  await expect.poll(async () => (await durations()).some((duration) => duration > 0)).toBe(true);
  // Finish the positive control's staggered CSS animations before recording the next turn.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    document.documentElement.dataset.themeAnimations = '[]';
  });
  const message = 'Mach die Übungen bitte kürzer.';
  await page.getByLabel('Schreib Buddy …').fill(message);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText('Mach ich – ab jetzt kurze Runden.', { exact: true })).toBeVisible();
  expect(
    (await durations()).filter((duration) => duration > 0),
    'live reduced motion skips new message fades',
  ).toEqual([]);
});

test('theme foundation: Pastell/Meer light/dark phone matrix', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await signUpMia(page, freshEmail('theme-matrix'));
  for (const family of ['Pastell', 'Meer'] as const) {
    for (const dark of [false, true]) {
      await openMenu(page, 'Einstellungen');
      await page.getByRole('button', { name: 'Aussehen', exact: true }).click();
      await page.getByRole('radio', { name: family, exact: true }).click();
      const toggle = page.getByRole('switch', { name: 'Dunkelmodus' });
      if ((await toggle.isChecked()) !== dark) await toggle.click();
      await expect(page.getByRole('radio', { name: family, exact: true })).toBeChecked();
      await expect(toggle).toBeChecked({ checked: dark });
      const name = `theme-${family.toLowerCase()}-${dark ? 'dark' : 'light'}`;
      await shot(page, `${name}-settings`, { opened: true });
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await expect(page.getByText('LearnBuddy', { exact: true })).toBeVisible();
      await shot(page, `${name}-home`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Mehr', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
      await shot(page, `${name}-menu`, { opened: true });
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Vokabeln', exact: true })).toBeHidden();
    }
  }
});
