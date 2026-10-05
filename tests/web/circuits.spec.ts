// Browser walkthrough of circuits, logic gates and Itten's colour wheel (issue #261). Scripted
// answers in apps/api/src/testing/scenarios/circuits.ts; every verdict below is code's (a number,
// an option code wrote, a colour name code computed) — no tutor is scripted for any. Every figure
// is shot at both phone sizes, light and dark (test-results/web/shots, 261…).

import { expect, test } from '@playwright/test';

import { bothRooms, chosen, onboardChild, startOffer, typed } from './figureWalk';

test('circuits, logic gates and the colour wheel: read, answered, graded by code', async ({
  page,
}) => {
  // Seven questions, five of them shot four times.
  test.setTimeout(360_000);
  await onboardChild(page, 'circuits');
  await startOffer(page, 'Lass uns Schaltpläne üben', 'Schaltpläne, Gatter und Farben');

  await expect(page.getByText('Leuchtet die Lampe L2', { exact: false })).toBeVisible();
  // The figure says in words what it shows: the battery, every part, the open switch.
  await expect(
    page.getByRole('img', { name: /Stromkreis mit Batterie 4,5 V.*L2.*Schalter S2 offen/ }),
  ).toBeVisible();
  await bothRooms(page, '261a-circuit-parallel');
  // The options are code's, not the model's.
  await chosen(page, 'Nein, L2 leuchtet nicht');

  await expect(page.getByText('Welche Stromstärke', { exact: false })).toBeVisible();
  await bothRooms(page, '261b-circuit-ammeter');
  await typed(page, '0,04');

  await expect(
    page.getByText('Ersatzwiderstand der ganzen Schaltung', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /R2 200 Ω.*parallel.*R3 200 Ω/ })).toBeVisible();
  await bothRooms(page, '261c-circuit-mixed');
  await typed(page, '200');

  await expect(page.getByText('Welchen Wert hat Q', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Schaltnetz.*G1: UND aus A und B.*Q = G3/ }),
  ).toBeVisible();
  await bothRooms(page, '261d-logic');
  await chosen(page, '1');

  await expect(page.getByText('In wie vielen Zeilen', { exact: false })).toBeVisible();
  await typed(page, '5');

  await expect(page.getByText('Komplementärfarbe von Rot', { exact: false })).toBeVisible();
  // Every field is named in words, never by its colour alone.
  await expect(
    page.getByRole('img', { name: /Farbkreis nach Itten.*markiert: Rot/ }),
  ).toBeVisible();
  await bothRooms(page, '261e-wheel-complement');
  await typed(page, 'Grün');

  await expect(page.getByText('Blau und Gelb mischst', { exact: false })).toBeVisible();
  await bothRooms(page, '261f-wheel-mix');
  await chosen(page, 'Grün');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
