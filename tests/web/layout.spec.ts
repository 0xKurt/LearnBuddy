// Layout under stress on a normal and a small phone: nothing may overlap the ways to start
// or spill past the screen edge. Screenshots go to test-results/web/shots (30-…).
//
// It used to anchor on a long name in the head, because the head carried a greeting that
// could be truncated. The head is the mark alone now (#125, #135) and the name only appears
// inside a chat bubble, which wraps — so the long name stays in the run as a realistic
// account, and what is measured is the mark, the row and the composer.
//
// Since #203 it also measures the answer cards: where a LINE of an answer ends, and whether
// the cards of a row are one row. That one needs specific words on the screen, so the test
// says which (see `answerChoices`) — the geometry is the real app's.

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
  // The Bundesland is a required field at registration (issue #199): one row that opens
  // a sheet with the sixteen; without a choice the CTA stays muted.
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

/**
 * Controls that stand in one row must look like one row — on the last line, the same
 * height, with the same air between them.
 *
 * This exists because of a bug the owner found and I could not explain to him (01.10.,
 * issue #187): once the composer field grew to two lines, "Senden" floated 8 pt above
 * the + and the waveform. The cause was a component quietly overriding its parent —
 * `Btn` pins itself with `alignSelf: 'flex-start'`, which beats the row's
 * `alignItems: 'flex-end'`. Nothing in the suite could see that: every check asked
 * whether a thing EXISTS and FITS, none asked whether things that belong together line
 * up. His question was "wieso gibt es dafür keinen test". This is the test.
 */
test('the composer row stays one row when the field grows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await onboard(page, 'Annalena-Marie');
  const field = page.getByLabel('Schreib Buddy …');
  await expect(field).toBeVisible();
  const oneLine = (await field.boundingBox())!.height;

  // Long enough to wrap several times in a 390 pt pill.
  await field.fill(
    'Ich schreibe am Freitag eine Mathearbeit über Brüche und weiß noch nicht, ' +
      'wo ich anfangen soll, kannst du mir dabei helfen das zu sortieren?',
  );
  const grown = (await field.boundingBox())!.height;
  // The field must really have grown, or everything below is checked in the one state where
  // the bug could not show itself. The browser pinned the textarea to one row until #188, and
  // that — not the missing check — is why the suite stayed blind to #187. A second line of
  // type is 22 pt, so 10 pt is more than rounding and less than one line: it cannot pass
  // while the field is still single-row.
  expect(grown - oneLine, 'the field grows with a long sentence').toBeGreaterThanOrEqual(10);

  const plus = (await page
    .getByRole('button', { name: 'Was möchtest du anhängen?' })
    .boundingBox())!;
  const send = (await page.getByRole('button', { name: 'Senden' }).boundingBox())!;
  const talk = (await page.getByRole('button', { name: 'Mit Buddy sprechen' }).boundingBox())!;

  // One line: every control ends where its neighbours end. 2 px for rounding.
  const bottom = (b: Box) => b.y + b.height;
  expect(
    Math.abs(bottom(plus) - bottom(talk)),
    '+ and the waveform end on the same line',
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(bottom(send) - bottom(talk)),
    'send and the waveform end on the same line',
  ).toBeLessThanOrEqual(2);

  // Same size: three touch targets in a row, not three different ones.
  for (const [what, b] of [
    ['+', plus],
    ['send', send],
  ] as const) {
    expect(
      Math.abs(b.height - talk.height),
      `${what} is as tall as the waveform`,
    ).toBeLessThanOrEqual(2);
  }

  // Air between the two round controls at the end (owner 01.10.: "der abstand zwischen
  // senden und voice mode button sollte groesser sein"). The pill's own gap is 2, which
  // is right next to the text field and too tight between two buttons.
  const gap = talk.x - (send.x + send.width);
  expect(gap, 'send and the waveform have real air between them').toBeGreaterThanOrEqual(6);

  await page.screenshot({ path: join(SHOTS, '31-composer-grown.png') });
});

/**
 * Answer cards: a line of an answer ends on a whole word, and the cards of a row are one row.
 *
 * This is the test for #203. In the owner's product video the English answer "the homework"
 * stood as "the / homewor / k" — three lines, cut inside the word, the card taller than its
 * neighbour, the row uneven. Nothing could see it: the component layer is blind to geometry
 * (jsdom lays nothing out, docs/testing-layers.md), and the walkthrough only ever asked
 * whether a control exists, fits and does not overlap — never where a line of it ends.
 *
 * The words have to be on the screen for that to be measurable, and the scripted model's own
 * sets are all single short words ("Romulus", "Wem?"). So the session's open question is given
 * the words of the issue on its way to the app: `page.route` patches `tap_choices` — the real
 * production field for words to tap (issue #147) — in the real response from the real API, and
 * everything after that is the app itself: its own build, its own component, its own layout in
 * Chromium at the two phone sizes of rule 16. Nothing of the server's behaviour is faked; the
 * subject here is the view.
 */
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
] as const;

/**
 * Options that belong to the question they are shown under ("Wie heißt die Hauptstadt von
 * Frankreich?" — issue #288, finding 7: vocabulary under a geography question is no way to judge a
 * design). Each fits one line of half a screen, so they stand two by two.
 */
const GRID_WORDS = ['Paris', 'Lyon', 'Marseille', 'Nizza'];
/** And longer ones that do not fit half a line: these go one under the other, full width. */
const FULL_WIDTH_WORDS = [
  'Paris an der Seine',
  'Lyon an der Rhône',
  'Marseille am Mittelmeer',
  'Straßburg am Rhein',
];

type ChoiceBox = {
  label: string;
  /** The text as the browser actually broke it, line by line. */
  lines: string[];
  /** The white card, the button inside it, and where the card starts. */
  card: { top: number; left: number; width: number; height: number };
  button: { top: number; height: number };
};

/**
 * What the browser made of each answer: the real line breaks (read with a Range, character by
 * character — the only way to see where a line actually ended) and the boxes around them.
 */
async function answerChoices(page: Page, labels: readonly string[]): Promise<ChoiceBox[]> {
  return page.evaluate((wanted) => {
    return wanted.map((label) => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('div, span')).find(
        (node) => node.children.length === 0 && node.textContent === label,
      );
      if (!el) throw new Error(`no element on the screen shows exactly "${label}"`);
      const text = el.firstChild;
      if (!text || text.nodeType !== Node.TEXT_NODE)
        throw new Error(`"${label}" is not one piece of text`);
      const whole = text.textContent ?? '';
      // Where each character sits. A character at a soft wrap can have an empty rect
      // (a collapsed space); it belongs to the line it is written next to, so it never
      // starts a new one by itself.
      const range = document.createRange();
      const lines: string[] = [];
      let current = '';
      let top: number | null = null;
      for (let i = 0; i < whole.length; i++) {
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const box = range.getBoundingClientRect();
        const here = box.width === 0 && box.height === 0 ? null : Math.round(box.top);
        if (here !== null && top !== null && Math.abs(here - top) > 2) {
          lines.push(current);
          current = '';
        }
        if (here !== null) top = here;
        current += whole[i];
      }
      lines.push(current);
      const button = el.closest('[role="button"]');
      if (!(button instanceof HTMLElement)) throw new Error(`"${label}" is not inside a button`);
      const card = button.parentElement;
      if (!card) throw new Error(`the button of "${label}" has no card around it`);
      const cb = card.getBoundingClientRect();
      const bb = button.getBoundingClientRect();
      return {
        label,
        lines,
        card: {
          top: Math.round(cb.top),
          left: Math.round(cb.left),
          width: Math.round(cb.width),
          height: Math.round(cb.height),
        },
        button: { top: Math.round(bb.top), height: Math.round(bb.height) },
      };
    });
  }, labels as string[]);
}

/** The cards grouped the way they stand: one entry per row, in reading order. */
function rowsOf(boxes: ChoiceBox[]): ChoiceBox[][] {
  const rows: ChoiceBox[][] = [];
  for (const box of [...boxes].sort(
    (a, b) => a.card.top - b.card.top || a.card.left - b.card.left,
  )) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.card.top - box.card.top) <= 2) row.push(box);
    else rows.push([box]);
  }
  return rows;
}

test('answer choices break only between words, and a row of them is one row', async ({ page }) => {
  let choices: readonly string[] = GRID_WORDS;
  // The real response from the real API, with the open question's words replaced.
  await page.route(/\/practice\/sessions(\/|$)/, async (route) => {
    const response = await route.fetch();
    const body: unknown = await response.json().catch(() => null);
    if (body === null || typeof body !== 'object' || !('items' in body)) {
      await route.fulfill({ response });
      return;
    }
    const session = body as { items: { status: string; item: { tap_choices: string[] | null } }[] };
    for (const entry of session.items) {
      if (entry.status === 'open') entry.item.tap_choices = [...choices];
    }
    await route.fulfill({ response, json: session });
  });

  await onboard(page, 'Lena');
  await page.getByLabel('Schreib Buddy …').fill('Ich will Hauptstädte üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Wie heißt die Hauptstadt von Frankreich?')).toBeVisible({
    timeout: 30_000,
  });

  for (const [what, set] of [
    ['grid', GRID_WORDS],
    ['full', FULL_WIDTH_WORDS],
  ] as const) {
    choices = set;
    await page.reload();
    await expect(page.getByRole('button', { name: set[0], exact: true })).toBeVisible({
      timeout: 30_000,
    });
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await page.waitForTimeout(400);
      const where = `${what} @ ${phone.width}`;
      const boxes = await answerChoices(page, set);

      // 1. No line of an answer ends inside a word — the bug of #203. A break is only
      //    allowed where the text itself allows one: at a space.
      for (const box of boxes) {
        for (let i = 1; i < box.lines.length; i++) {
          const before = box.lines[i - 1]!;
          const after = box.lines[i]!;
          expect(
            /\s$/.test(before) || /^\s/.test(after),
            `${where}: "${box.label}" breaks inside a word (${box.lines.map((l) => `"${l}"`).join(' / ')})`,
          ).toBe(true);
        }
      }

      // 2. The set is laid out the way the arithmetic in ChoiceList.tsx decided: short words
      //    two by two, a word too long for half a line full width, one under the other.
      const rows = rowsOf(boxes);
      const perRow = rows.map((row) => row.length);
      if (what === 'grid') expect(perRow, `${where}: two by two`).toEqual([2, 2]);
      else expect(perRow, `${where}: one per row`).toEqual([1, 1, 1, 1]);

      // 3. Cards of a row are equally tall (the uneven row of the screenshot), and so are
      //    their buttons: the whole white card is tappable, not only its top.
      for (const row of rows) {
        for (const box of row) {
          expect(
            Math.abs(box.card.height - row[0]!.card.height),
            `${where}: "${box.label}" is as tall as its neighbour`,
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(box.button.height - box.card.height),
            `${where}: the button of "${box.label}" fills its card`,
          ).toBeLessThanOrEqual(1);
          // A tappable thing is never smaller than this (TOUCH, lib/theme/space.ts).
          expect(box.button.height, `${where}: "${box.label}" is tappable`).toBeGreaterThanOrEqual(
            44,
          );
          // And nothing reaches past the screen.
          expect(
            box.card.left,
            `${where}: "${box.label}" starts on the screen`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            box.card.left + box.card.width,
            `${where}: "${box.label}" ends on the screen`,
          ).toBeLessThanOrEqual(phone.width);
        }
      }

      // 4. Nothing scrolls sideways (a word set with `overflow-wrap: normal` would show up here).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${where}: no sideways scrolling`).toBeLessThanOrEqual(0);

      await page.screenshot({ path: join(SHOTS, `32-choices-${what}-${phone.width}.png`) });
      // And at night: the tiles, their letters and the shadow have to hold on the dark palette.
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(SHOTS, `32-choices-${what}-${phone.width}-night.png`) });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForTimeout(300);
    }
  }
});
