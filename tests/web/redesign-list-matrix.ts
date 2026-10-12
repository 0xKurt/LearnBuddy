// Shared proof owned by Library; later list-screen units reuse this after Library merges (#548).
import { expect, type Page } from '@playwright/test';
import { paletteOf, themeNameOf, type Family } from '../../apps/mobile/lib/theme/palettes';
import { screenShots } from './redesign-screen-matrix';
export {
  screenTargets as visibleListTargets,
  screenShots as listShots,
} from './redesign-screen-matrix';

const LOOKS: ReadonlyArray<{ family: Family; label: string }> = [
  { family: 'pastell', label: 'Pastell' },
  { family: 'forest', label: 'Wald' },
  { family: 'ocean', label: 'Meer' },
  { family: 'sunset', label: 'Abend' },
];
const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
};

export async function listLookMatrix(
  page: Page,
  path: string,
  title: string,
  name: string,
): Promise<void> {
  // Real settings UI/persistence, never route mocks or direct storage injection.
  for (const look of LOOKS)
    for (const dark of [false, true]) {
      await page.goto('/settings');
      await page.getByRole('button', { name: 'Aussehen', exact: true }).click();
      await page.getByRole('radio', { name: look.label, exact: true }).click();
      await expect(page.getByRole('radio', { name: look.label, exact: true })).toBeChecked();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.goto(path);
      const heading = page.getByRole('heading', { name: title, exact: true });
      await expect(heading).toBeVisible();
      const palette = paletteOf(themeNameOf(look.family, dark));
      await expect(heading).toHaveCSS('color', rgb(palette.ink));
      await expect(heading).toHaveCSS('font-family', /Figtree/);
      // Prove actual chosen palette rather than silently photographing fallback colours.
      await expect
        .poll(() =>
          heading.evaluate((element, expected) => {
            for (let node: Element | null = element; node; node = node.parentElement)
              if (getComputedStyle(node).backgroundColor === expected) return true;
            return false;
          }, rgb(palette.bg)),
        )
        .toBe(true);
      await screenShots(page, `${name}-${look.family}-${dark ? 'dark' : 'light'}`);
    }
}
