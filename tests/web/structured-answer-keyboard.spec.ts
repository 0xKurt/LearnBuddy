import { expect, test, type Locator } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { a11y, cutControls, overflows, PHONES, SHOTS } from './fit';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCREEN_LOOKS, screenLook } from './redesign-screen-matrix';

async function wholeFrame(input: Locator) {
  await expect(input).toBeFocused();
  await expect
    .poll(() =>
      input.evaluate((field) => {
        const frame = field.closest('[data-testid="answer-cell-frame"]')!;
        const r = frame.getBoundingClientRect();
        const ring = Number.parseFloat(getComputedStyle(frame).outlineWidth) || 0;
        let top = 0,
          bottom = innerHeight,
          left = 0,
          right = innerWidth;
        for (let p = frame.parentElement; p; p = p.parentElement) {
          if (/hidden|scroll|auto/.test(getComputedStyle(p).overflow)) {
            const b = p.getBoundingClientRect();
            top = Math.max(top, b.top);
            bottom = Math.min(bottom, b.bottom);
            left = Math.max(left, b.left);
            right = Math.min(right, b.right);
          }
        }
        return (
          r.height >= 44 &&
          r.width >= 44 &&
          r.top - ring >= top - 1 &&
          r.bottom + ring <= bottom + 1 &&
          r.left - ring >= left - 1 &&
          r.right + ring <= right + 1
        );
      }),
    )
    .toBe(true);
}

for (const look of SCREEN_LOOKS)
  test(`structured table keyboard · ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await onboardChild(page, 'structured-keyboard');
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Lass uns eine Vierfeldertafel ausfüllen');
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByText('eine Vierfeldertafel und danach', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: "Los geht's" }).last().click();
    const names = [
      'Katze, kein Hund',
      'keine Katze, Hund',
      'keine Katze, Summe',
      'Summe, kein Hund',
    ];
    const values = ['6', '8', '20', '17'];
    const cell = (name: string) => page.getByLabel(name, { exact: true });
    await cell(names[0]).click();
    for (const value of values.slice(0, -1)) {
      await page.keyboard.type(value);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.type('17');
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect(cell(names[0])).toBeVisible();
      await cell(names[0]).focus();
      await expect(cell(names[0])).toBeFocused();
      await page.setViewportSize({ width: phone.width, height: phone.height - 300 });
      for (const [index, name] of names.entries()) {
        await wholeFrame(cell(name));
        await expect(cell(name)).toHaveValue(values[index]);
        if (index < names.length - 1) await page.keyboard.press('Enter');
      }
      await expect(page.getByTestId('scroll-answer-form')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tipp', exact: true })).toHaveCount(0);
      const capture = async (name: string) => {
        expect((await overflows(page)).filter((entry) => !entry.allowed)).toEqual([]);
        expect(await cutControls(page)).toEqual([]);
        expect(await a11y(page, name)).toEqual([]);
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: join(SHOTS, `${name}.png`) });
      };
      await capture(`table-keyboard-${key}-${phone.width}`);
      await page.setViewportSize(phone);
      await cell(names.at(-1)!).blur();
      await expect(page.getByTestId('scroll-answer-form')).toHaveCount(0);
      await expect
        .poll(async () =>
          (await overflows(page)).filter(
            (entry) => entry.label === 'scroll-parts' && !entry.allowed,
          ),
        )
        .toEqual([]);
      await capture(`table-restored-${key}-${phone.width}`);
    }
    const sent = page.waitForRequest(
      (request) => request.url().endsWith('/answer') && request.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    expect(
      (await sent).postDataJSON().parts.cells.map((entry: { text: string }) => entry.text),
    ).toEqual(values);
    await expect(
      page.getByText('3 von 4 Feldern stimmen. Schau nochmal bei „Summe“ / „kein Hund“.'),
    ).toBeVisible();
    for (const [index, name] of names.entries())
      await expect(cell(name)).toHaveValue(values[index]);
    await cell(names.at(-1)!).fill('18');
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Rechne die Zahlenmauer aus:', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Reihe 1, Stein 1', { exact: true })).toBeVisible();
  });

const COLUMN_ADD: Record<string, string> = {
  r3c5: '0',
  r2c4: '',
  r3c4: '1',
  r2c3: '1',
  r3c3: '1',
  r2c2: '1',
  r3c2: '6',
};
const COLUMN_DIV: Record<string, string> = {
  r0c6: '2',
  r1c0: '6',
  r2c0: '',
  r2c1: '7',
  r0c7: '2',
  r3c0: '',
  r3c1: '6',
  r4c1: '1',
  r4c2: '2',
  r0c8: '4',
  r5c1: '1',
  r5c2: '3',
  r6c2: '0',
};

for (const look of SCREEN_LOOKS)
  for (const scenario of [
    {
      name: 'addition carry',
      message: 'Lass uns schriftlich addieren',
      offer: 'Ziffer für Ziffer',
      cells: COLUMN_ADD,
      focus: 'r2c4',
      correction: '1',
      feedback: 'Noch nicht ganz – bei den Zehnern fehlt noch der Übertrag.',
      targets: ['r2c4', 'r3c2', 'r3c5'],
    },
    {
      name: 'division third step',
      message: 'Ich will dreistellig teilen',
      offer: 'drei Schritte',
      cells: COLUMN_DIV,
      focus: 'r5c2',
      correction: '2',
      feedback: 'Noch nicht ganz – im 3. Schritt stimmt das Malnehmen noch nicht.',
      targets: ['r0c6', 'r0c7', 'r0c8', 'r5c1', 'r5c2', 'r6c2'],
    },
  ])
    test(`structured written keyboard · ${scenario.name} · ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
      page,
    }) => {
      await onboardChild(page, 'structured-written');
      const key = await screenLook(page, look);
      await startOffer(page, scenario.message, scenario.offer);
      for (const [id, digit] of Object.entries(scenario.cells)) {
        const field = page.getByTestId(`column-${id}`);
        if (await field.evaluate((element) => element instanceof HTMLInputElement))
          await field.fill(digit);
      }
      const field = page.getByTestId(`column-${scenario.focus}`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        for (const id of scenario.targets) {
          const target = page.getByTestId(`column-${id}`);
          await target.focus();
          await wholeFrame(target);
        }
        await field.focus();
        await expect(field).toBeFocused();
        const node = await field.elementHandle();
        await page.setViewportSize({ width: 540, height: phone.height });
        await expect
          .poll(() =>
            node!.evaluate((element) => element.isConnected && element === document.activeElement),
          )
          .toBe(true);
        await wholeFrame(field);
        await page.setViewportSize({ width: phone.width, height: phone.height - 300 });
        await expect
          .poll(() =>
            node!.evaluate((element) => element.isConnected && element === document.activeElement),
          )
          .toBe(true);
        for (const id of scenario.targets) {
          const target = page.getByTestId(`column-${id}`);
          await target.focus();
          await wholeFrame(target);
        }
        await field.focus();
        await wholeFrame(field);
        await expect(field).toHaveValue(scenario.cells[scenario.focus]);
        expect((await overflows(page)).filter((entry) => !entry.allowed)).toEqual([]);
        expect(await cutControls(page)).toEqual([]);
        expect(await a11y(page, `written-${scenario.name}-${key}-${phone.width}`)).toEqual([]);
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({
          path: join(SHOTS, `written-${scenario.name}-${key}-keyboard-${phone.width}.png`),
        });
        await page.setViewportSize(phone);
        await field.blur();
        await expect(page.getByTestId('scroll-answer-form')).toHaveCount(0);
        expect((await overflows(page)).filter((entry) => !entry.allowed)).toEqual([]);
        await page.screenshot({
          path: join(SHOTS, `written-${scenario.name}-${key}-restored-${phone.width}.png`),
        });
      }
      const sent = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().endsWith('/answer'),
      );
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      const payload = (await sent).postDataJSON().parts as {
        type: string;
        cells: { id: string; digit: string }[];
      };
      expect(payload.type).toBe('column_calc');
      for (const [id, digit] of Object.entries(scenario.cells))
        expect(payload.cells.find((cell) => cell.id === id)?.digit).toBe(digit);
      await expect(page.getByText(scenario.feedback, { exact: true })).toBeVisible();
      await field.fill(scenario.correction);
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Stimmt', { exact: false }).last()).toBeVisible();
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.getByText('Geschafft!', { exact: true })).toBeVisible();
    });
