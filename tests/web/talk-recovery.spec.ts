// Failed turns and practice offers stay in the same spoken conversation (#938).
// requires live verification in Claude Code session (speech replaced at the network edge)
import { expect, test } from '@playwright/test';
import { PHONES, shot } from './fit';
import { chatCardAction } from './chatCard';
import { onboardTalker, sayOneThing, voiceAsSilence, LISTENING } from './talk';
import { screenLook, SCREEN_LOOKS } from './redesign-screen-matrix';

for (const phone of PHONES)
  for (const look of [SCREEN_LOOKS[0]!, SCREEN_LOOKS[1]!]) {
    test(`talk recovery and practice ${phone.width} ${look.dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await page.setViewportSize(phone);
      await onboardTalker(page, 'talk-recovery');
      const theme = await screenLook(page, look);
      await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      await expect(page.getByText('Cool – Handball merke ich mir.').last()).toBeVisible();
      await voiceAsSilence(page, 600);
      let words = 'Danke';
      let fail = true;
      const attempts: string[] = [];
      await page.route('**/v1/buddy/messages', (route) => {
        if (route.request().method() === 'POST') {
          attempts.push(
            (route.request().postDataJSON() as { client_message_id: string }).client_message_id,
          );
        }
        if (route.request().method() === 'POST' && fail) {
          return route.abort('failed');
        }
        return route.continue();
      });
      await page.route('**/v1/voice/transcribe', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: `event: done\ndata: ${JSON.stringify({ text: words })}\n\n`,
        }),
      );
      await sayOneThing(page, true);
      const tail = page.getByTestId('scroll-talk').filter({ visible: true });
      await expect(tail).toBeVisible();
      await expect(tail.getByText('Ich spiele Handball', { exact: true })).toBeAttached();
      const retry = page
        .getByRole('button', { name: 'Nochmal versuchen', exact: true })
        .filter({ visible: true });
      await expect(retry).toBeVisible();
      await expect(tail.getByRole('status', { name: 'Buddy schreibt …' })).toHaveCount(0);
      await shot(page, `talk-recovery-${theme}-${phone.width}-failed`, { phones: [phone] });
      fail = false;
      await retry.click();
      await expect(page.getByText('Gern!').last()).toBeVisible();
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(new Set(attempts).size).toBe(1);
      await expect(page.getByText(LISTENING)).toBeVisible();
      words = 'Ich will Brüche vergleichen üben';
      await sayOneThing(page, false);
      const offer = chatCardAction(page, 'Brüche vergleichen');
      await expect(offer).toBeVisible();
      await shot(page, `talk-recovery-${theme}-${phone.width}-offer`, { phones: [phone] });
      await offer.click();
      await expect(
        page.getByRole('heading', { name: 'Brüche vergleichen', exact: true }),
      ).toBeVisible();
      await page.goBack();
      await expect(page.getByText('Gespräch', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Beenden', exact: true }).last().click();
    });
  }
