// Layout under stress: a long name ("Annalena-Marie") on a normal and a small
// phone. Nothing may overlap the ring's buttons or spill past the screen edge.
// Screenshots go to test-results/web/shots (30-…).

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SHOTS = join(__dirname, '../../test-results/web/shots');

async function onboard(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`layout-${Date.now()}-${Math.random()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill(name);
  await page.getByLabel('TT').fill('10');
  await page.getByLabel('MM').fill('02');
  await page.getByLabel('JJJJ').fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox').click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test(`a long name fits on ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await onboard(page, 'Annalena-Marie');
    const greeting = page.getByText('Annalena-Marie', { exact: false }).first();
    await expect(greeting).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `30-long-name-${viewport.width}.png`) });

    // The greeting stays inside the screen and clear of every ring button.
    const g = await greeting.boundingBox();
    expect(g).not.toBeNull();
    expect(g!.x).toBeGreaterThanOrEqual(0);
    expect(g!.x + g!.width).toBeLessThanOrEqual(viewport.width);
    for (const name of ['Arbeit', 'Hausaufgabe', 'Aussprache', 'Vokabeln', 'Erklär mir was']) {
      const b = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(b, name).not.toBeNull();
      expect(overlaps(g!, b!), `greeting overlaps ${name}`).toBe(false);
      expect(b!.x, name).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width, name).toBeLessThanOrEqual(viewport.width);
    }
    // The ring's buttons (icon and label) never run into each other.
    const names = ['Arbeit', 'Hausaufgabe', 'Aussprache', 'Vokabeln', 'Erklär mir was'];
    const boxes = await Promise.all(
      names.map((name) => page.getByRole('button', { name, exact: true }).boundingBox()),
    );
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        expect(overlaps(boxes[i]!, boxes[j]!), `${names[i]} overlaps ${names[j]}`).toBe(false);
    // The composer bar: camera, field and mic inside the screen, the field centred on the mic.
    const camera = await page
      .getByRole('button', { name: 'Arbeitsblatt fotografieren' })
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
