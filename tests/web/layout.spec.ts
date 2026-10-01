// Layout under stress on a normal and a small phone: nothing may overlap the ways to start
// or spill past the screen edge. Screenshots go to test-results/web/shots (30-…).
//
// It used to anchor on a long name in the head, because the head carried a greeting that
// could be truncated. The head is the mark alone now (#125, #135) and the name only appears
// inside a chat bubble, which wraps — so the long name stays in the run as a realistic
// account, and what is measured is the mark, the row and the composer.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SHOTS = join(__dirname, '../../test-results/web/shots');

async function onboard(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`layout-${Date.now()}-${Math.random()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill(name);
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await page.getByRole('button', { name: `Los geht's, ${name}!` }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // The three first-start cards (app/onboarding.tsx): this test is about the home.
  await page.getByRole('button', { name: 'Überspringen' }).click();
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test(`the home fits on ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await onboard(page, 'Annalena-Marie');
    const mark = page.getByText('LearnBuddy').first();
    await expect(mark).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `30-home-fits-${viewport.width}.png`) });

    // The head stays inside the screen: the name and the way into everything else
    // never run into each other (issue #174 — the row of four circles moved into ⋯).
    const g = await mark.boundingBox();
    expect(g).not.toBeNull();
    expect(g!.x).toBeGreaterThanOrEqual(0);
    expect(g!.x + g!.width).toBeLessThanOrEqual(viewport.width);
    const more = await page.getByRole('button', { name: 'Mehr', exact: true }).boundingBox();
    expect(more).not.toBeNull();
    expect(overlaps(g!, more!), 'mark overlaps ⋯').toBe(false);
    expect(more!.x).toBeGreaterThanOrEqual(0);
    expect(more!.x + more!.width).toBeLessThanOrEqual(viewport.width);

    // Every way to start is reachable through ⋯ and fits inside the screen.
    // "Erklär mir was" is gone (owner decision 28.09.): explaining happens in the chat.
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.screenshot({ path: join(SHOTS, `30b-menu-${viewport.width}.png`) });
    for (const name of ['Arbeit', 'Hausaufgabe', 'Aussprache', 'Vokabeln']) {
      const b = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(b, name).not.toBeNull();
      expect(b!.x, name).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width, name).toBeLessThanOrEqual(viewport.width);
    }
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Vokabeln', exact: true })).toBeHidden();
    // The composer bar: camera, field and mic inside the screen, the field centred on the mic.
    const camera = await page
      .getByRole('button', { name: 'Was möchtest du anhängen?' })
      .boundingBox();
    const mic = await page.getByRole('button', { name: 'Nachricht sprechen' }).boundingBox();
    const field = await page.getByLabel('Schreib Buddy …').boundingBox();
    for (const [what, box] of [
      ['camera', camera],
      ['mic', mic],
      ['field', field],
    ] as const) {
      expect(box, what).not.toBeNull();
      expect(box!.x, what).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, what).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height, what).toBeLessThanOrEqual(viewport.height);
    }
    const centre = (b: Box) => b.y + b.height / 2;
    expect(Math.abs(centre(field!) - centre(mic!))).toBeLessThanOrEqual(3);
    expect(Math.abs(centre(camera!) - centre(mic!))).toBeLessThanOrEqual(3);
    // One compact row while empty (not a two-line box).
    expect(field!.height).toBeLessThanOrEqual(48);
    // No sideways scrolling anywhere.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
