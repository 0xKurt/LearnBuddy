import { expect, type Page } from '@playwright/test';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { PHONES, shot } from './fit';
import { freshEmail, PIN } from './coreLoop';
export const ONBOARDING_LOOKS = [
  { family: 'pastell', dark: false },
  { family: 'pastell', dark: true },
  { family: 'ocean', dark: false },
  { family: 'ocean', dark: true },
] as const;
export async function onboardingStart(page: Page, look: (typeof ONBOARDING_LOOKS)[number]) {
  await page.addInitScript(({ family, dark }) => {
    if (sessionStorage.getItem('redesign.onboarding.look')) return;
    sessionStorage.setItem('redesign.onboarding.look', 'set');
    localStorage.setItem('lb.theme', family);
    localStorage.setItem('lb.themeMode', dark ? 'dark' : 'light');
  }, look);
  await page.goto('/');
  const email = freshEmail('onboarding-redesign');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(
    page.getByRole('heading', { name: 'Wer lernt mit LearnBuddy?', exact: true }),
  ).toBeVisible();
  // Switch the running application preference, not only startup media.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return email;
}
export async function onboardingReducedPress(page: Page, name: string) {
  const action = page.getByRole('button', { name, exact: true });
  await expect(action).toBeEnabled();
  const box = await action.boundingBox();
  expect(box).not.toBeNull();
  const scales = () =>
    action.evaluate((element) =>
      [element, ...element.querySelectorAll('*')].flatMap((node) => {
        const transform = getComputedStyle(node).transform;
        if (transform === 'none') return [];
        const matrix = new DOMMatrixReadOnly(transform);
        return Math.abs(matrix.a - 1) > 0.001 || Math.abs(matrix.d - 1) > 0.001 ? [transform] : [];
      }),
    );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  try {
    await expect
      .poll(async () => (await scales()).length, 'normal held press scales')
      .toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(scales, 'same held action settles on live reduction').toEqual([]);
  } finally {
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
}
export async function onboardingAppearance(
  page: Page,
  look: (typeof ONBOARDING_LOOKS)[number],
  primaryActionLabel?: string,
) {
  const heading = page.getByRole('heading').first();
  const primary = paletteOf(themeNameOf(look.family, look.dark)).primary;
  const valuePrimary = Number.parseInt(primary.slice(1), 16);
  const expectedPrimary = `rgb(${valuePrimary >> 16}, ${(valuePrimary >> 8) & 255}, ${valuePrimary & 255})`;
  const actions = page.getByRole('button', {
    name: primaryActionLabel ?? /^(Weiter|Ja, erlauben|Los geht's.*|C'est parti.*|Suivant)$/,
    exact: primaryActionLabel !== undefined,
  });
  let painted = false;
  for (const action of await actions.all()) {
    if (!(await action.isVisible())) continue;
    const paints = await action.evaluate(
      (element, color) =>
        [element, ...element.querySelectorAll('*')].some(
          (node) => getComputedStyle(node).backgroundColor === color,
        ),
      expectedPrimary,
    );
    if (paints) {
      painted = true;
      if (await action.isEnabled())
        await onboardingReducedPress(
          page,
          (await action.getAttribute('aria-label')) ?? (await action.innerText()),
        );
      break;
    }
  }
  expect(painted, 'actual route action proves family primary, beyond shared ink').toBe(true);
  const hex = paletteOf(themeNameOf(look.family, look.dark)).ink;
  const value = Number.parseInt(hex.slice(1), 16);
  await expect(heading).toHaveCSS(
    'color',
    `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`,
  );
  await expect(heading).toHaveCSS('font-family', /Figtree/);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
}
export async function onboardingShots(
  page: Page,
  name: string,
  look: (typeof ONBOARDING_LOOKS)[number],
  opened = false,
  primaryActionLabel?: string,
) {
  await onboardingAppearance(page, look, primaryActionLabel);
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    const small = await page
      .locator('[role="button"], [role="radio"], [role="checkbox"], input')
      .evaluateAll((elements) =>
        elements.flatMap((el) => {
          if (el.closest('[aria-hidden="true"]')) return [];
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height || b.bottom <= 0 || b.top >= innerHeight) return [];
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflow)) {
              const c = p.getBoundingClientRect();
              if (b.bottom <= c.top || b.top >= c.bottom) return [];
            }
          }
          return b.width < 43.5 || b.height < 43.5
            ? [`${el.getAttribute('aria-label') ?? el.textContent}: ${b.width}×${b.height}`]
            : [];
        }),
      );
    expect(small, 'actual visible onboarding targets').toEqual([]);
    await shot(page, `${name}-${phone.width}`, { opened, phones: [phone] });
  }
}
export async function childToParent(page: Page) {
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('14');
  await page.getByLabel('Monat', { exact: true }).fill('03');
  await page.getByLabel('Jahr', { exact: true }).fill('2013');
  await page.getByRole('button', { name: 'Weiter' }).click();
}
export async function parentToContact(page: Page) {
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill(PIN);
  await page.getByLabel('PIN wiederholen').fill(PIN);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Darf Buddy Mia Benachrichtigungen schicken?')).toBeVisible();
}
