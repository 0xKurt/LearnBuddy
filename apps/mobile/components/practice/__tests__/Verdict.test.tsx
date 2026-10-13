// The verdict under her answer is a sign and a word on the verdict's tint (design
// components/buddy/Message.jsx:24–31, #599): colour is never the only signal. A miss and "Fast"
// carry the cross on the "wrong" tint (ui_kits/app/Flows.jsx:40, :113); an answer nobody could
// judge keeps the quiet chip without a sign.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { VerdictTag, type VerdictKey } from '../Verdict.js';

const CHECK = 'M5 12l5 5 9-10';
const CROSS = 'M6 6l12 12M18 6L6 18';

function rgb(hex: string): string {
  return `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;
}

describe('the verdict chip', () => {
  const p = paletteOf('pastell');
  it.each<[VerdictKey, string, string | null, string, string]>([
    ['correct', 'Richtig', CHECK, p.mint, p.successText],
    ['incorrect', 'Noch nicht ganz', CROSS, p.blush, p.danger],
    ['partially_correct', 'Fast', CROSS, p.blush, p.danger],
    ['unchecked', 'Nicht geprüft', null, p.canvas, p.ink2],
  ])('%s: its sign, its tint and its word', (verdict, label, sign, bg, color) => {
    renderInApp(<VerdictTag verdict={verdict} label={label} fresh={false} />);
    const chip = screen.getByLabelText(label);
    expect(styleOf(chip).backgroundColor).toBe(rgb(bg));
    const path = chip.querySelector('path');
    expect(path?.getAttribute('d') ?? null).toBe(sign);
    if (path) expect(path.getAttribute('stroke')).toBe(color);
    expect(screen.getByText(label).style.color).toBe(rgb(color));
  });

  it('is 26 high with 10 at its sides, as the design draws it', () => {
    renderInApp(<VerdictTag verdict="incorrect" label="Noch nicht ganz" fresh={false} />);
    const chip = styleOf(screen.getByLabelText('Noch nicht ganz'));
    expect([chip.paddingTop, chip.paddingBottom]).toEqual(['4px', '4px']);
    expect([chip.paddingLeft, chip.paddingRight]).toEqual(['10px', '10px']);
    expect(screen.getByText('Noch nicht ganz').style.lineHeight).toBe('18px');
  });
});
