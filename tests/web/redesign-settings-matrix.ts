// Settings proof reuses the published appearance and screenshot contracts.
import type { Page } from '@playwright/test';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
export const SETTINGS_LOOKS = SCREEN_LOOKS;
export async function settingsLook(
  page: Page,
  look: (typeof SETTINGS_LOOKS)[number],
): Promise<string> {
  const key = await screenLook(page, look);
  await page.goto('/settings');
  return key;
}
export { screenShots as settingsShots };
