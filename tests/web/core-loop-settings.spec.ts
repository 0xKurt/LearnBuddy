// Core loop, part 5 of 5 (issue #381): the settings — messages the parent allowed, Buddy's voice
// she picked in the setup, the look in every colour and at night (home and conversation).
// Starts from a fresh learner whose parent allowed messages in the setup, with the PIN (coreLoop.ts;
// part 1 checks that way). This stack has no natural voices, so there is no voice to choose
// (issue #526).

import buddyDe from '../../apps/mobile/locales/de/buddy.json';
import { expect, test, type Page } from '@playwright/test';

import { freshEmail, openMenu as openMenuOf, planTest, signUpMia } from './coreLoop';
import { shot } from './fit';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';
const inkCss = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
};

test('core loop · settings: messages, voice, the look by day and by night', async ({ page }) => {
  const email = freshEmail('settings');
  await signUpMia(page, email);
  await planTest(page);
  const openMenu = (item: string) => openMenuOf(page, item);

  // Allowed in the setup (issue #518): the settings say "Ja" at once (rule 5).
  await openMenu('Einstellungen');
  await expect(page.getByText('Benachrichtigungen', { exact: true })).toBeVisible();
  await expect(page.getByText('Nein – nur hier in der App.')).toHaveCount(0);
  await expect(page.getByText(/^Ja – nie nach/)).toBeVisible({ timeout: 1_000 });
  await expect(page.getByText('Für Eltern')).toBeVisible();
  await shot(page, '15-settings');
  // Every row says what is set now; one tap opens its page (#589).
  await page.getByRole('button', { name: /^Aufs Handy, Ja – nie nach/ }).click();
  await expect(page.getByRole('heading', { name: 'Aufs Handy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nicht mehr erlauben' })).toBeVisible();
  // Where the note about phone messages lives, calmly (instead of a toast on the home).
  await expect(page.getByText(/Alles kommt hier in der App\./)).toBeVisible();
  await shot(page, '15b-settings-contact');
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  // Buddy's voice: no row at all without his own voices — the phone's voice would read
  // every sample alike (issue #526).
  await expect(page.getByRole('button', { name: /^Buddys Stimme/ })).toHaveCount(0);
  await page.goto('/settings/voice');
  await expect(page).toHaveURL(/\/settings$/);
  await openLicences(page, '15d-settings-about', '15e-settings-licences');

  // ── The look: every option previews in ITS OWN colours, and night stays readable ──
  // (issue #84: module-scope styles froze the start palette's ink, which was invisible on
  // the night background — the axe pass at every shot is what catches that class now.)
  const darkSwitch = page.getByRole('radio', { name: 'Dunkel', exact: true });
  await expect(darkSwitch).not.toBeChecked();
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
  await shot(page, '15f-settings-look', { opened: true });
  // Two axes since issue #140: the colours are one choice, dark is another. Dark with the
  // colours kept is the combination the owner asked for — "blau eingestellt, blaue highlights".
  await page.getByRole('radio', { name: 'Meer' }).click();
  await expect(page.getByRole('radio', { name: 'Meer' })).toHaveAttribute('aria-checked', 'true');
  await darkSwitch.click();
  await expect(darkSwitch).toBeChecked();
  await shot(page, '15g-settings-night', { opened: true });
  await openLicences(page, '15g1-settings-about-night', '15g2-settings-licences-night');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  // The whole home in the night palette: fit and contrast, like every other stop.
  await shot(page, '15h-home-night');
  // And the conversation screen in the dark, because that is where the light lives
  // (issue #139): Buddy's halo and the light carpet behind him used to be fixed white,
  // which on #191627 is a bright disc, not a glow. The caption sits on the brightest part
  // of it, so the contrast check at every shot is what holds this.
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText(buddyDe.talk.title, { exact: true })).toBeVisible();
  await shot(page, '15i-talk-night');
  await page.getByRole('button', { name: 'Beenden' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  await openMenu('Einstellungen');
  await page.getByRole('radio', { name: 'Pastell' }).click();
  await page.getByRole('radio', { name: 'Hell', exact: true }).click();
  const system = page.getByRole('radio', { name: 'System', exact: true });
  await system.click();
  await expect(system).toBeChecked();
  await page.reload();
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toHaveCSS(
    'color',
    inkCss(PALETTES.pastellDark.ink),
  );
  await expect(page.getByRole('radio', { name: 'Dunkel', exact: true })).not.toBeChecked();
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toHaveCSS(
    'color',
    inkCss(PALETTES.pastell.ink),
  );
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});

/**
 * „Über LearnBuddy“ → Lizenzen (issues #493, #589): each a page of its own. The licences list
 * what the app ships, one row per package; a tap opens its licence text under the row. Ends back
 * on the settings.
 */
async function openLicences(page: Page, about: string, licences: string): Promise<void> {
  const back = () => page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByRole('button', { name: 'Über LearnBuddy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Über LearnBuddy', exact: true })).toBeVisible();
  await shot(page, about);
  await page.getByRole('button', { name: 'Lizenzen', exact: true }).click();
  await expect(page.getByText(/mit freier Software gebaut/)).toBeVisible();
  const first = page.getByRole('button', { name: /^@babel\/runtime [\d.]+, MIT$/ });
  await expect(page.getByText(/Permission is hereby granted/)).toHaveCount(0);
  await first.click();
  await expect(page.getByText(/Permission is hereby granted/)).toBeVisible();
  await shot(page, licences, { opened: true });
  await back();
  await expect(page.getByText(/mit freier Software gebaut/)).toHaveCount(0);
  await back();
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
}
