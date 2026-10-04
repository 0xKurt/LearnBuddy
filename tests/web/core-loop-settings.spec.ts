// Core loop, part 5 of 5 (issue #381): the settings — messages the parent allowed, Buddy's voice
// she picked in the setup, the look in every colour and at night (home and conversation).
// Starts from a fresh learner who picked the voice "Hell" and whose parent allowed messages with
// the PIN (coreLoop.ts; parts 1 and 2 check that way).

import { expect, test } from '@playwright/test';

import { allowPush, freshEmail, openMenu as openMenuOf, planTest, signUpMia } from './coreLoop';
import { shot } from './fit';

test('core loop · settings: messages, voice, the look by day and by night', async ({ page }) => {
  const email = freshEmail('settings');
  await signUpMia(page, email);
  await planTest(page);
  await allowPush(page);
  // The old single spec reached the settings after a reload too. Without one, settings opened
  // within 15 s of the voice step shows the cached "Nein": the chat's opt-in does not refresh
  // the cached settings (found while splitting, issue #381) — a finding of its own, not this
  // scenario's subject.
  await page.reload();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  const openMenu = (item: string) => openMenuOf(page, item);

  await openMenu('Einstellungen');
  await expect(page.getByText('Benachrichtigungen', { exact: true })).toBeVisible();
  await expect(page.getByText('Für Eltern')).toBeVisible();
  await shot(page, '15-settings');
  // Every group is closed with what is set now; one tap opens it.
  await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nicht mehr erlauben' })).toBeVisible();
  // Where the note about phone messages lives, calmly (instead of a toast on the home).
  await expect(page.getByText(/Alles kommt hier in der App\./)).toBeVisible();
  await shot(page, '15b-settings-contact', { opened: true });
  // Buddy's voice: closed with the one she picked in the setup; opened, the same picker.
  await expect(page.getByText('Hell', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buddys Stimme' }).click();
  const repicked = page.waitForResponse(
    (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH' && r.ok(),
  );
  await page.getByRole('radio', { name: 'Klar' }).click();
  await repicked;
  await shot(page, '15c-settings-voice', { opened: true });
  await page.getByRole('button', { name: 'Buddys Stimme' }).click();
  await expect(page.getByText('Klar', { exact: true })).toBeVisible();

  // ── The look: every option previews in ITS OWN colours, and night stays readable ──
  // (issue #84: module-scope styles froze the start palette's ink, which was invisible on
  // the night background — the axe pass at every shot is what catches that class now.)
  await page.getByRole('button', { name: 'Aussehen' }).click();
  // Four colour cards and one switch since issue #172 — "einmal farb cards, dazu einen
  // hell/dunkel switch, thats it" (owner, on seeing seven preview cards on the phone).
  const darkSwitch = page.getByRole('switch', { name: 'Hell oder dunkel?' });
  await expect(darkSwitch).toBeVisible();
  await shot(page, '15f-settings-look', { opened: true });
  // Two axes since issue #140: the colours are one choice, dark is another. Dark with the
  // colours kept is the combination the owner asked for — "blau eingestellt, blaue highlights".
  await page.getByRole('radio', { name: 'Meer' }).click();
  await expect(page.getByRole('radio', { name: 'Meer' })).toHaveAttribute('aria-checked', 'true');
  await darkSwitch.click();
  await expect(darkSwitch).toHaveAttribute('aria-checked', 'true');
  await shot(page, '15g-settings-night', { opened: true });
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  // The whole home in the night palette: fit and contrast, like every other stop.
  await shot(page, '15h-home-night');
  // And the conversation screen in the dark, because that is where the light lives
  // (issue #139): Buddy's halo and the light carpet behind him used to be fixed white,
  // which on #191627 is a bright disc, not a glow. The caption sits on the brightest part
  // of it, so the contrast check at every shot is what holds this.
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText('GESPRÄCH')).toBeVisible();
  await shot(page, '15i-talk-night');
  await page.getByRole('button', { name: 'Beenden' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  await openMenu('Einstellungen');
  await page.getByRole('button', { name: 'Aussehen' }).click();
  await page.getByRole('radio', { name: 'Pastell' }).click();
  await page.getByRole('switch', { name: 'Hell oder dunkel?' }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});
