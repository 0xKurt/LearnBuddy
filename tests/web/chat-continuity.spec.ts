import { BuddyHome } from '@learnbuddy/shared-types/contracts';
// requires live verification in Claude Code session — speech uses the existing silent WAV seam.
import { expect, test, type Page } from '@playwright/test';
import { signUpMia, freshEmail } from './coreLoop';
import { sayOneThing, voiceAsSilence, REPLY } from './talk';
import { PHONES, shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS.filter((l) => l.family === 'pastell')) {
  test(`chat keeps text and spoken turns: ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(180_000);
    await signUpMia(page, freshEmail('chat-continuity'));
    const key = await screenLook(page, look);
    for (const text of ['Ich spiele Handball', 'Danke', 'Hallo', 'Danke nochmal']) {
      await page.getByLabel('Schreib Buddy …').fill(text);
      const done = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/buddy/messages'),
      );
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      await (await done).finished();
      await expect(page.getByRole('button', { name: 'Stopp', exact: true })).toHaveCount(0);
    }
    await voiceAsSilence(page, 15_000);
    await sayOneThing(page, true);
    await expect(page.getByText(REPLY).last()).toBeVisible();
    await page.getByRole('button', { name: 'Tastatur', exact: true }).click();
    await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
    const thread = page.getByTestId('scroll-thread');
    await expect(thread.getByText('Ich spiele Handball', { exact: true })).toHaveCount(1);
    await expect(thread.getByText(REPLY, { exact: true })).toHaveCount(1);
    await screenShots(page, `chat-${key}-after-talk`);
    await showEarlier(page, 'Ich spiele Handball');
    await screenShots(page, `chat-${key}-earlier`);
    await page.getByRole('button', { name: 'Mit Buddy sprechen', exact: true }).click();
    await page.getByRole('button', { name: 'Beenden', exact: true }).click();
    await expect(thread.getByText('Ich spiele Handball', { exact: true })).toHaveCount(1);
    await expect(thread.getByText(REPLY, { exact: true })).toHaveCount(1);
  });
}

for (const look of SCREEN_LOOKS.filter((l) => l.family === 'pastell')) {
  test(`structured summary in chat: ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('chat-summary'));
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
    // Only model-written words are replaced; real persisted messages and app rendering stay.
    await page.route('**/v1/buddy', async (route) => {
      const response = await route.fetch();
      const home = BuddyHome.parse(await response.json());
      const last = home.thread.filter((m) => m.role === 'buddy').at(-1)!;
      last.text =
        '## Unser Überblick\nDer Wasserkreislauf verbindet vier Schritte.\n\n- **Verdunstung:** Sonnenwärme lässt Wasser aufsteigen.\n- **Kondensation:** Wassertröpfchen bilden Wolken.\n- **Niederschlag:** Wasser fällt zurück.\n- **Rückfluss:** Wasser sammelt sich erneut.\n\n## Noch offen\nWie halten wir die Beobachtung am kalten Glas fest?';
      await route.fulfill({ response, json: home });
    });
    await page.reload();
    const thread = page.getByTestId('scroll-thread');
    await expect(thread.getByText('Unser Überblick', { exact: true })).toBeVisible();
    await expect(thread).not.toContainText('##');
    await expect(thread).not.toContainText('**');
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await showEarlier(page, 'Unser Überblick');
      await shot(page, `chat-${key}-summary-${phone.width}`, { phones: [phone] });
    }
  });
}

async function showEarlier(page: Page, text: string) {
  const thread = page.getByTestId('scroll-thread');
  await thread.hover();
  await page.mouse.wheel(0, -600);
  await thread.getByText(text, { exact: true }).scrollIntoViewIfNeeded();
}

test('older pages load inline without moving the message being read', async ({ page }) => {
  await signUpMia(page, freshEmail('chat-older'));
  await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
  let older: BuddyHome['thread'] = [];
  await page.route('**/v1/buddy', async (route) => {
    const response = await route.fetch();
    const home = BuddyHome.parse(await response.json());
    const base = home.thread.find((m) => m.role === 'buddy')!;
    const messages = Array.from({ length: 60 }, (_, n) => ({
      ...base,
      id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
      text: `Nachricht ${n + 1}`,
      actions: [],
      created_at: new Date(Date.UTC(2026, 0, 1, 12, n)).toISOString(),
    }));
    older = messages.slice(0, 20);
    home.thread = messages.slice(20);
    home.thread_has_more = true;
    await route.fulfill({ response, json: home });
  });
  await page.route('**/v1/buddy/thread?before=*', (route) =>
    route.fulfill({ json: { messages: older, has_more: false } }),
  );
  await page.reload();
  await showEarlier(page, 'Nachricht 21');
  const anchor = page.getByText('Nachricht 21', { exact: true });
  const button = page.getByRole('button', { name: 'Ältere Nachrichten', exact: true });
  await button.scrollIntoViewIfNeeded();
  const before = (await anchor.boundingBox())!.y;
  await button.click();
  await expect(page.getByText('Nachricht 1', { exact: true })).toHaveCount(1);
  await expect.poll(async () => Math.abs((await anchor.boundingBox())!.y - before)).toBeLessThan(3);
  expect(new URL(page.url()).pathname).not.toBe('/history');
});
