// Browser walkthrough of solids, cube nets and points in space (issue #255). Scripted answers
// in apps/api/src/testing/scenarios/solids.ts; every verdict below is code's (a number, an option
// code wrote, a point) — no tutor is scripted for any. Every question is shot at both phone
// sizes, light and dark (test-results/web/shots, 96-…). The rest of #255 (#368) — prisms with a
// non-regular base, nets of other solids, Würfelgebäude and their views — in its own run (99-…).

import { expect, test, type Page } from '@playwright/test';

import { bothRooms, chosen, onboardChild, startOffer, typed } from './figureWalk';
import { shot } from './fit';

test('solids, cube nets and points in space: read, answered, graded by code', async ({ page }) => {
  // Eleven questions, each shot four times.
  test.setTimeout(420_000);
  await onboardChild(page, 'solids');
  await startOffer(page, 'Lass uns Körper üben', 'Körper, Netze und Punkte');

  await expect(page.getByText('Volumen dieses Quaders', { exact: false })).toBeVisible();
  // The figure says in words what it shows: the kind and its measures.
  await expect(page.getByRole('img', { name: /Schrägbild: Quader.*Tiefe 3 cm/ })).toBeVisible();
  await bothRooms(page, '96-solid-cuboid');
  await typed(page, '30');

  await expect(page.getByText('Wie viele Kanten', { exact: false })).toBeVisible();
  await bothRooms(page, '96-solid-prism');
  await typed(page, '18');

  await expect(page.getByText('Volumen der Pyramide', { exact: false })).toBeVisible();
  await bothRooms(page, '96-solid-pyramid');
  await typed(page, '48');

  await expect(page.getByText('Oberfläche des Zylinders', { exact: false })).toBeVisible();
  await bothRooms(page, '96-solid-cylinder');
  await typed(page, '150,8');

  await expect(page.getByText('Volumen des Kegels', { exact: false })).toBeVisible();
  await bothRooms(page, '96-solid-cone');
  await typed(page, '75,4');

  await expect(page.getByText('Volumen der Kugel', { exact: false })).toBeVisible();
  await bothRooms(page, '96-solid-sphere');
  await typed(page, '113,1');

  await expect(page.getByText('Lässt sich dieses Netz', { exact: false })).toBeVisible();
  await bothRooms(page, '97-net-fold');
  // The options are code's, not the model's ("Ja").
  await chosen(page, 'Ja, das ist ein Würfelnetz');

  await expect(page.getByText('gegenüber von Quadrat 2', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Quadrat 2 in Zeile 1, Spalte 2/ })).toBeVisible();
  await bothRooms(page, '97-net-opposite');
  await typed(page, '5');

  await expect(page.getByText('Welches dieser Netze', { exact: false })).toBeVisible();
  await shot(page, '97-net-choice');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '97-net-choice-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: /^B: Sechs Quadrate/ }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Welche Koordinaten hat der Punkt A?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Punkt A: 2 in x-Richtung/ })).toBeVisible();
  await bothRooms(page, '98-axes-point');
  await typed(page, '(2|3|2)');

  await expect(page.getByText('Vektor von A nach B', { exact: false })).toBeVisible();
  await bothRooms(page, '98-axes-vector');
  await typed(page, '(-1|1|1)');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});

/** A view question: its options are pictures, shot light and dark, then the right one picked. */
async function viewPicked(page: Page, name: string, option: RegExp): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: option }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

test('the rest of #255: irregular prisms, nets of solids, Würfelgebäude (#368, #418)', async ({
  page,
}) => {
  // Twelve questions, each shot four times.
  test.setTimeout(660_000);
  await onboardChild(page, 'solids-more');
  await startOffer(
    page,
    'Lass uns Netze und Würfelgebäude üben',
    'Prismen, Netze und Würfelgebäude',
  );

  await expect(page.getByText('Prismas mit trapezförmiger', { exact: false })).toBeVisible();
  // The base's plain sides, its height and the length — said in words too.
  await expect(
    page.getByRole('img', { name: /Grundfläche mit den Seiten 6 cm, 2 cm.*Höhe 5 cm/ }),
  ).toBeVisible();
  await bothRooms(page, '99-solid-trapezoid');
  await typed(page, '60');

  await expect(page.getByText('Oberfläche des Dreiecksprismas', { exact: false })).toBeVisible();
  await bothRooms(page, '99-solid-triangle');
  await typed(page, '132');

  // An L and a house as the base (#418): only the outer sides of the L are written, the house's
  // whole height is drawn — said in words too.
  await expect(page.getByText('L-förmiger Grundfläche', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Grundfläche mit den Seiten 4 cm, 1 cm, 1 cm, 3 cm, Höhe 5 cm/ }),
  ).toBeVisible();
  await bothRooms(page, '99-solid-l');
  await typed(page, '30');

  await expect(page.getByText('hausförmiger Grundfläche', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Höhe der Grundfläche 6 cm/ })).toBeVisible();
  await bothRooms(page, '99-solid-house');
  await typed(page, '168');

  await expect(page.getByText('Welcher Körper entsteht', { exact: false })).toBeVisible();
  // The net never names its solid: that is the question.
  await expect(page.getByRole('img', { name: /Netz eines Körpers/ })).toBeVisible();
  await bothRooms(page, '99-net-cuboid');
  // The options are code's, not the model's: the cube stands next to the cuboid (#418).
  await expect(page.getByRole('button', { name: 'Würfel', exact: true })).toBeVisible();
  await chosen(page, 'Quader');

  // A cone's net (#418): four options code picked, the cone among its neighbours, marked by code.
  await expect(page.getByText('Zu welchem Körper', { exact: false })).toBeVisible();
  await bothRooms(page, '99-net-cone');
  await chosen(page, 'Kegel');

  await expect(page.getByText('Zylinders aus seinem Netz', { exact: false })).toBeVisible();
  await bothRooms(page, '99-net-cylinder');
  await typed(page, '87,96');

  await expect(page.getByText('Aus wie vielen Würfeln', { exact: false })).toBeVisible();
  await bothRooms(page, '99-cubes-count');
  await typed(page, '9');

  await expect(page.getByText('für diesen Bauplan', { exact: false })).toBeVisible();
  await bothRooms(page, '99-cubes-plan');
  await typed(page, '8');

  await expect(page.getByText('Welche Ansicht von vorn', { exact: false })).toBeVisible();
  await viewPicked(page, '99-cubes-views', /^B: Ansicht von vorn/);

  // The side and the top view of the same building (#418).
  await expect(page.getByText('Welche Ansicht von links', { exact: false })).toBeVisible();
  await viewPicked(page, '99-cubes-side', /^B: Ansicht von links/);

  await expect(page.getByText('Welche Ansicht von oben', { exact: false })).toBeVisible();
  await viewPicked(page, '99-cubes-top', /^C: Ansicht von oben/);
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
