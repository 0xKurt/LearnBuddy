// Browser walkthrough of the maps (issue #251): Germany with its 16 Länder on 360×740, every one
// tapped (Berlin, Bremen, Hamburg through the magnifying first tap); a marked country named by
// typing; a capital's position read off the graticule; a zone tapped on the world map. Real app,
// real API, scripted model (apps/api/src/testing/scenarios/learning-modes.ts). Every stop is shot
// at 390×844 and 360×740 and fails when anything would have to be scrolled (tests/web/fit.ts).
//
// Where to tap comes from the same Natural Earth data the app draws (packages/shared-maps): a
// Land's anchor, put through the map's own viewBox on screen — a frame that moved would miss.

import { expect, test, type Page } from '@playwright/test';

import { mapFeature, mapFeatures } from '../../packages/shared-maps/src/index';
import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`maps-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** Map units → page position, through the drawn map's viewBox. */
async function onPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([ux, uy]) => {
      const layer = document.querySelector('[data-testid="figure-touch"]');
      const svg = layer?.parentElement?.querySelector('svg');
      if (!svg) throw new Error('no map');
      const r = svg.getBoundingClientRect();
      const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
      return {
        x: r.left + ((ux! - vx!) / vw!) * r.width,
        y: r.top + ((uy! - vy!) / vh!) * r.height,
      };
    },
    [x, y],
  );
}

const ZOOMED = 'Vergrößert – tippe jetzt genau.';

/** A tap where the feature is; a second one when the first magnified the map. */
async function tapAt(page: Page, x: number, y: number): Promise<boolean> {
  const at = await onPage(page, x, y);
  await page.mouse.click(at.x, at.y);
  if (await page.getByText(ZOOMED).isVisible()) {
    const again = await onPage(page, x, y);
    await page.mouse.click(again.x, again.y);
    return true;
  }
  return false;
}

const chosenD = (page: Page) =>
  page.evaluate(() => document.getElementById('map-chosen')?.getAttribute('d') ?? null);

test('maps: tap every Land, name a country, read a position, tap a zone (issue #251)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByLabel('Schreib Buddy …').fill('Ich will die Bundesländer auf der Karte üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('hier kommt eine stumme Karte', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Tippe auf Bayern.')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen' });
  await expect(check).toBeDisabled();
  await expect(page.getByText('Tippe auf die Karte.')).toBeVisible();
  await shot(page, '70-map-tap');

  // ── All 16 Länder on 360×740, each chosen where it lies (acceptance of #251). ──
  const zoomedFor: string[] = [];
  for (const land of mapFeatures('germany', 'areas')) {
    if (await tapAt(page, land.anchor[0], land.anchor[1])) zoomedFor.push(land.id);
    await expect.poll(() => chosenD(page), land.id).toBe(land.d);
    await expect(page.getByText('Deine Wahl ist markiert.')).toBeVisible();
  }
  // The small ones needed the magnifying first tap; the large ones did not.
  expect(zoomedFor).toEqual(expect.arrayContaining(['DE-BE', 'DE-HB', 'DE-HH']));
  expect(zoomedFor).not.toContain('DE-BY');

  // The magnified map, shot on its own: a tap near Berlin.
  const berlin = mapFeature('germany', 'areas', 'DE-BE')!;
  const near = await onPage(page, berlin.anchor[0], berlin.anchor[1]);
  await page.mouse.click(near.x, near.y);
  await expect(page.getByText(ZOOMED)).toBeVisible();
  await shot(page, '71-map-zoomed');
  await page.getByRole('button', { name: 'Ganze Karte' }).click();

  // A neighbour first: code names what she tapped.
  const he = mapFeature('germany', 'areas', 'DE-HE')!;
  await tapAt(page, he.anchor[0], he.anchor[1]);
  await check.click();
  await expect(page.getByText('Knapp daneben – das ist Hessen, ein Nachbar.')).toBeVisible();
  await shot(page, '72-map-neighbour');
  const by = mapFeature('germany', 'areas', 'DE-BY')!;
  await tapAt(page, by.anchor[0], by.anchor[1]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => chosenD(page)).toBe(by.d);
  await shot(page, '73-map-tap-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── A marked country, named by typing: checked against the data's names. ──
  await expect(page.getByText('Wie heißt das markierte Land?')).toBeVisible();
  await expect(page.getByText('Ein Land ist markiert.')).toBeVisible();
  await shot(page, '74-map-name');
  const field = page.getByLabel('Name des Markierten');
  await field.fill('Spanien');
  await check.click();
  await expect(page.getByText('Das liegt woanders auf der Karte', { exact: false })).toBeVisible();
  await field.fill('Italin');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '75-map-name-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Richtig! Geschrieben wird es: Italien.')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Berlin's position read off the graticule, in whole degrees. ──
  await expect(page.getByText('Welche Koordinaten hat die markierte Hauptstadt?')).toBeVisible();
  await expect(page.getByText('Lies Breite und Länge in ganzen Grad ab.')).toBeVisible();
  await shot(page, '76-map-coords');
  await page.getByLabel('Breite in Grad').fill('52');
  await page.getByLabel('Länge in Grad').fill('13');
  await page.getByRole('button', { name: 'Nord – tippen für Süd' }).click();
  await expect(page.getByText('Deine Angabe: 52° S, 13° O')).toBeVisible();
  await check.click();
  await expect(page.getByText('Nord oder Süd', { exact: false })).toBeVisible();
  await shot(page, '77-map-coords-feedback');
  await page.getByRole('button', { name: 'Süd – tippen für Nord' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.getByText('Deine Angabe: 52° N, 13° O')).toBeVisible();
  await shot(page, '78-map-coords-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── A zone on the world map: between the tropics. ──
  await expect(page.getByText('Tippe auf die Zone zwischen den Wendekreisen.')).toBeVisible();
  const tropics = mapFeature('world', 'zones', 'z-tropics')!;
  await tapAt(page, 1000, tropics.anchor[1]);
  await expect(page.getByText('Deine Wahl ist markiert.')).toBeVisible();
  await shot(page, '79-map-zone');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
