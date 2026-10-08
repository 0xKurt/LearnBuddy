// A number and its unit stay on one line (issue #467): "15 km/h" broke at 360 px into "15" at
// the end of a line and "km/h" at the start of the next. The units come from the unit table
// the grading uses (packages/shared-math/src/units.ts), never from a list of words here.

import { describe, expect, it } from 'vitest';

import { bindUnits, NO_BREAK } from '../quantity.js';

const bound = (text: string) => text.replaceAll(NO_BREAK, '~');

describe('bindUnits', () => {
  it('binds a number to the unit right after it (the acceptance cases)', () => {
    expect(bound(bindUnits('mit 15 km/h'))).toBe('mit 15~km/h');
    expect(bound(bindUnits('Die Fläche ist 3,5 m² groß.'))).toBe('Die Fläche ist 3,5~m² groß.');
    expect(bound(bindUnits('20 % Rabatt'))).toBe('20~% Rabatt');
    expect(bound(bindUnits('Das Wasser hat 90 °C.'))).toBe('Das Wasser hat 90~°C.');
  });

  it('leaves a number before an ordinary word breakable', () => {
    expect(bindUnits('15 Kinder fahren mit.')).toBe('15 Kinder fahren mit.');
    expect(bindUnits('2 mindestens')).toBe('2 mindestens');
    expect(bindUnits('in 3 Mengen')).toBe('in 3 Mengen');
  });

  it('binds only after a number, never a unit after a word', () => {
    expect(bindUnits('wie viel m sind das')).toBe('wie viel m sind das');
    expect(bindUnits('Teil h')).toBe('Teil h');
  });

  it('knows the unit table: symbols, written names, angles, per mille and money', () => {
    expect(bound(bindUnits('2 Stunden und 30 min'))).toBe('2~Stunden und 30~min');
    expect(bound(bindUnits('ein Winkel von 45 °'))).toBe('ein Winkel von 45~°');
    expect(bound(bindUnits('0,5 ‰ und 12 € und 40 ct'))).toBe('0,5~‰ und 12~€ und 40~ct');
    expect(bound(bindUnits('1,2 l Saft, 250 g Mehl, 3 kg'))).toBe('1,2~l Saft, 250~g Mehl, 3~kg');
  });

  it('keeps the case of capital symbols: 5 N is newton, 5 n a variable', () => {
    expect(bound(bindUnits('mit 5 N'))).toBe('mit 5~N');
    expect(bound(bindUnits('mit 5 n'))).toBe('mit 5 n');
    expect(bound(bindUnits('12 V und 2 A'))).toBe('12~V und 2~A');
  });

  it('ends a unit at punctuation, and joins several spaces into one', () => {
    expect(bound(bindUnits('Er fährt 18 km/h.'))).toBe('Er fährt 18~km/h.');
    expect(bound(bindUnits('(15 km/h)'))).toBe('(15~km/h)');
    expect(bound(bindUnits('15   km/h'))).toBe('15~km/h');
  });

  it('never binds across a line break', () => {
    expect(bindUnits('Sie hat 15\nkm/h')).toBe('Sie hat 15\nkm/h');
  });

  it('binds the unit at the start when the text follows a number', () => {
    // "$15$ km/h", "**15** km/h": the number stands in the run before.
    expect(bound(bindUnits(' km/h schnell', { afterNumber: true }))).toBe('~km/h schnell');
    expect(bindUnits(' km/h schnell')).toBe(' km/h schnell');
    expect(bindUnits(' Kinder', { afterNumber: true })).toBe(' Kinder');
  });
});
