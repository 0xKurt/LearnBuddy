// Early screen matrix owned by Home, before Library/Settings integration.
import { expect, type Page } from '@playwright/test';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { PHONES, shot } from './fit';
export const SCREEN_LOOKS = [
  { family: 'pastell', label: 'Pastell', dark: false },
  { family: 'pastell', label: 'Pastell', dark: true },
  { family: 'ocean', label: 'Meer', dark: false },
  { family: 'ocean', label: 'Meer', dark: true },
] as const;
export async function screenLook(page: Page, look: (typeof SCREEN_LOOKS)[number]): Promise<string> {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Aussehen', exact: true }).click();
  await page.getByRole('radio', { name: look.label, exact: true }).click();
  await expect(page.getByRole('radio', { name: look.label, exact: true })).toBeChecked();
  const mode = page.getByRole('radio', { name: look.dark ? 'Dunkel' : 'Hell', exact: true });
  await mode.click();
  await expect(mode).toBeChecked();
  const hex = paletteOf(themeNameOf(look.family, look.dark)).ink;
  const value = Number.parseInt(hex.slice(1), 16);
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toHaveCSS(
    'color',
    `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`,
  );
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toHaveCSS(
    'font-family',
    /Figtree/,
  );
  await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toHaveCSS(
    'color',
    `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`,
  );
  const primary = page.locator('[data-testid="composer-primary"]:visible');
  await expect(primary).toHaveCount(1);
  const action = Number.parseInt(
    paletteOf(themeNameOf(look.family, look.dark)).primary.slice(1),
    16,
  );
  const actionColor = `rgb(${action >> 16}, ${(action >> 8) & 255}, ${action & 255})`;
  await expect
    .poll(
      () =>
        primary.evaluate(
          (element, expected) =>
            [element, ...element.querySelectorAll('*')].some((node) => {
              const rect = node.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                getComputedStyle(node).backgroundColor === expected
              );
            }),
          actionColor,
        ),
      { message: 'visible Composer inner paint proves actual selected family primary' },
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return `${look.family}-${look.dark ? 'dark' : 'light'}`;
}
export async function screenTargets(page: Page): Promise<void> {
  const small = await page
    .locator('[role="button"], [role="radio"], [role="checkbox"], [role="switch"], input, textarea')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (element.closest('[aria-hidden="true"]')) return [];
        const box = element.getBoundingClientRect();
        if (
          !box.width ||
          !box.height ||
          box.bottom <= 0 ||
          box.top >= innerHeight ||
          box.right <= 0 ||
          box.left >= innerWidth
        )
          return [];
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflow)) {
            const clip = parent.getBoundingClientRect();
            if (
              box.bottom <= clip.top ||
              box.top >= clip.bottom ||
              box.right <= clip.left ||
              box.left >= clip.right
            )
              return [];
          }
        }
        return box.width < 43.5 || box.height < 43.5
          ? [
              `${element.getAttribute('aria-label') ?? element.textContent}: ${box.width}×${box.height}`,
            ]
          : [];
      }),
    );
  expect(small, 'visible actual screen controls retain44 targets').toEqual([]);
}
export async function screenShots(page: Page, name: string, opened = false): Promise<void> {
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await screenTargets(page);
    await shot(page, `${name}-${phone.width}`, { opened, phones: [phone] });
  }
}
