// Itten's colour wheel next to a question (issue #261): every field named in words in every
// language and every name inside the narrowest phone, a marked field set apart by more than its
// colour, the twelve tones apart from each other in the light and the dark room — and the name
// she reads on a field is the very word the server grades (`apps/api/src/i18n`, colorCheck.ts).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ITTEN_HUES } from '../../../../../packages/shared-math/src/itten.js';
import { figureOf, PALETTES } from '../../../lib/theme/palettes.js';
import { renderInApp } from '../../../testing/render.js';
import {
  ColorWheelBody,
  describeColorWheel,
  hueLines,
  wheelLayout,
  type ColorWheelFig,
} from '../ColorWheel.js';

const LOCALES = ['de', 'en', 'fr', 'es', 'it'] as const;
const root = join(__dirname, '../../../../..');
const json = (path: string) =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<
    string,
    Record<string, Record<string, string>>
  >;

const appNames = (lang: string) => {
  const figure = json(`apps/mobile/locales/${lang}/math.json`).figure as unknown as Record<
    string,
    string
  >;
  return ITTEN_HUES.map((h) => figure[`hue_${h}`]);
};

const wheel: ColorWheelFig = {
  type: 'color_wheel',
  hl: ['orange', 'violet', 'green'],
  ask: 'mix',
  at: ['blue', 'yellow'],
};

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('the names on the wheel', () => {
  it.each(LOCALES)('%s: twelve different names, the same words the server grades', (lang) => {
    const names = appNames(lang);
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(12);
    const server = json(`apps/api/src/i18n/${lang}.json`).practice?.color ?? {};
    expect(names).toEqual(ITTEN_HUES.map((h) => server[h]));
  });

  it.each(LOCALES)('%s: every name stands inside the narrowest phone', (lang) => {
    const layout = wheelLayout(appNames(lang) as string[], 266);
    expect(layout).not.toBeNull();
    expect(layout!.r).toBeGreaterThanOrEqual(56);
    for (const label of layout!.labels) {
      expect(label.box.x0).toBeGreaterThanOrEqual(0);
      expect(label.box.x1).toBeLessThanOrEqual(266);
      expect(label.box.y0).toBeGreaterThanOrEqual(0);
      expect(label.box.y1).toBeLessThanOrEqual(layout!.height);
    }
  });

  it('breaks a compound after its hyphen, a single word never', () => {
    expect(hueLines('Blauviolett')).toEqual(['Blauviolett']);
    expect(hueLines('Blue-violet')).toEqual(['Blue-', 'violet']);
    expect(hueLines('Rojo violeta')).toEqual(['Rojo', 'violeta']);
  });
});

describe('the twelve tones', () => {
  /** CIE76 colour difference in Lab (D65): what an eye tells apart, unlike a distance in RGB. */
  const lab = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const f = (v: number) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const deltaE = (a: string, b: string) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!));

  it.each(Object.keys(PALETTES))('%s: twelve tones, every neighbour clearly apart', (name) => {
    const hues = figureOf(PALETTES[name as keyof typeof PALETTES]).hues;
    expect(hues).toHaveLength(12);
    hues.forEach((h, k) => expect(deltaE(h, hues[(k + 1) % 12]!)).toBeGreaterThan(20));
  });
});

describe('ColorWheelBody', () => {
  it('draws every field with its name, a marked one in bold', () => {
    const { container } = renderInApp(<ColorWheelBody figure={wheel} width={266} />);
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(12 + 6 + 3);
    const bold = Array.from(container.querySelectorAll('text')).filter(
      (n) => (n as SVGTextElement).style.fontWeight === '700',
    );
    expect(bold.map((n) => n.textContent)).toEqual(['Orange', 'Violett', 'Grün']);
  });
});

describe('describeColorWheel', () => {
  it('says every field in order, the star and the marked fields', () => {
    const said = describeColorWheel(wheel, t);
    expect(said).toContain('figure.wheel {"fields":"figure.hue_yellow, figure.hue_yellow_orange');
    expect(said).toContain('figure.wheel_star');
    expect(said).toContain(
      'figure.wheel_marked {"fields":"figure.hue_orange, figure.hue_violet, figure.hue_green"}',
    );
  });
});
