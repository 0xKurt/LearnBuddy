// Einen gehörten Rhythmus nachklopfen (issue #445): das Klopffeld. Festgehalten wird hier, was
// zwischen „ein großer Knopf" und „sie kann damit einen Rhythmus geben" liegt:
//
//   · ein Schlag zählt, wenn der Finger AUFSETZT — nicht, wenn er loslässt; gemessen mit der
//     monotonen Uhr (`performance.now()`), und was herausgeht, sind die Abstände vom ersten Schlag
//     in genau der Form, die der Server zurückliest (`parseTaps`);
//   · jeder Schlag ist zu sehen (ein Punkt) und zu hören (sein Name sagt, wie oft sie geklopft hat)
//     — und nichts davon sagt, ob er sitzt: das misst erst der Server;
//   · „Prüfen" wartet auf den zweiten Schlag, „Neu klopfen" nimmt alles zurück, und nach „Prüfen"
//     beginnt sie von vorn.
//
// Was diese Schicht nicht sehen kann: wie genau ein Finger auf einem Telefon die Zeit trifft. Das
// ist der Gerätetest (issue #445); der Walkthrough klopft im Browser (`tests/web/ear.spec.ts`).

import { parseTaps } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { RhythmTaps } from '../RhythmTaps.js';

/** Die monotone Uhr, die das Feld liest, um so viele Millisekunden weiter. */
const wait = (ms: number) => vi.advanceTimersByTime(ms);

const pad = () => screen.getByRole('button', { name: 'Hier klopfen' });
const check = () => screen.getByRole('button', { name: 'Prüfen' });
/** Der Finger setzt auf — und hebt ab. Gezählt ist der Schlag beim Aufsetzen. */
function hit() {
  fireEvent.mouseDown(pad());
  fireEvent.mouseUp(pad());
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the pad she taps a heard rhythm on (#445)', () => {
  it('counts a beat when the finger lands and sends the gaps from the first one', () => {
    const onCheck = vi.fn();
    renderInApp(<RhythmTaps disabled={false} onCheck={onCheck} />);
    wait(10_000.4);
    fireEvent.mouseDown(pad());
    // Noch nicht losgelassen, und der Schlag ist schon da.
    expect(screen.getByLabelText('1 Schlag geklopft')).toBeDefined();
    // Losgelassen wird irgendwann; gezählt ist, wann der Finger aufsetzte.
    wait(120);
    fireEvent.mouseUp(pad());
    for (const gap of [629.8, 750.4, 375, 375]) {
      wait(gap);
      hit();
    }
    expect(screen.getByLabelText('5 Schläge geklopft')).toBeDefined();

    fireEvent.click(check());
    expect(onCheck).toHaveBeenCalledWith('0 750 1500 1875 2250', '5 Schläge geklopft');
    // Genau die Form, die der Server zurückliest.
    expect(parseTaps(onCheck.mock.calls[0]?.[0] as string)).toEqual([0, 750, 1500, 1875, 2250]);
    // Nach „Prüfen" beginnt sie von vorn.
    expect(screen.queryByLabelText(/geklopft/)).toBeNull();
  });

  it('waits with "Prüfen" for the second beat, and "Neu klopfen" takes all back', () => {
    const onCheck = vi.fn();
    renderInApp(<RhythmTaps disabled={false} onCheck={onCheck} />);
    const again = () => screen.getByRole('button', { name: 'Neu klopfen' });
    // Nothing to take back yet: no "Neu klopfen".
    expect(screen.queryByRole('button', { name: 'Neu klopfen' })).toBeNull();
    hit();
    fireEvent.click(check());
    expect(onCheck).not.toHaveBeenCalled();
    wait(400);
    hit();
    wait(400);
    hit();
    fireEvent.click(again());
    expect(screen.queryByLabelText(/geklopft/)).toBeNull();
    fireEvent.click(check());
    expect(onCheck).not.toHaveBeenCalled();
  });

  it('takes no beat while the question is locked', () => {
    renderInApp(<RhythmTaps disabled onCheck={vi.fn()} />);
    hit();
    expect(screen.queryByLabelText(/geklopft/)).toBeNull();
  });
});
